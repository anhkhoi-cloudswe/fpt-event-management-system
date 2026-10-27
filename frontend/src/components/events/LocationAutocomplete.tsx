import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Building2, Loader2, MapPin, X } from 'lucide-react'
import {
  searchLocations,
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
    placeholder: 'Nhập địa chỉ hoặc tên địa điểm tổ chức...',
    rateLimitWarning: 'Bạn đã thực hiện quá nhiều thao tác tìm kiếm địa chỉ. Vui lòng thử lại sau.',
    fallbackNotice: 'Hạn mức tra cứu tự động hôm nay đã đạt giới hạn. Bạn có thể tự do nhập tay địa chỉ bình thường.',
    minCharsNotice: 'Gõ từ 3 ký tự trở lên để xem gợi ý tự động',
  },
  en: {
    title: 'Event Venue & Physical Address',
    badge: 'Independent Venue',
    placeholder: 'Enter venue name or address...',
    rateLimitWarning: 'Too many search requests. Please try again later.',
    fallbackNotice: 'Automatic lookup quota reached for today. You can freely type your address manually.',
    minCharsNotice: 'Type at least 3 characters for autocomplete suggestions',
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
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)
  const [isFallbackMode, setIsFallbackMode] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep query in sync if parent updates location externally
  useEffect(() => {
    const parentVal = location || venueName || ''
    if (parentVal !== query && !isOpen) {
      setQuery(parentVal)
    }
  }, [location, venueName])

  // Handle outside click to close dropdown cleanly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Input change handler: saves text directly to form state
  const handleInputChange = (val: string) => {
    setQuery(val)
    onVenueNameChange(val)
    onLocationChange(val)
    setRateLimitError(null)

    const trimmed = val.trim()
    // Do NOT show suggestions or call API if less than 3 characters
    if (trimmed.length < 3) {
      setSuggestions([])
      setIsOpen(false)
      setIsLoading(false)
    }
  }

  // Mandatory Debounce (400ms) and Min-length (>= 3 chars) API calling
  useEffect(() => {
    const trimmed = query.trim()

    // 1. Min-length requirement: < 3 chars -> Never trigger API
    if (trimmed.length < 3) {
      setSuggestions([])
      setIsOpen(false)
      setIsLoading(false)
      return
    }

    // 2. If already switched to manual fallback mode, don't spam API
    if (isFallbackMode) {
      return
    }

    // 3. Debounce: 400ms delay after user stops typing
    const controller = new AbortController()
    setIsLoading(true)

    const timer = setTimeout(async () => {
      try {
        const result = await searchLocations(trimmed, controller.signal)
        if (controller.signal.aborted) return

        if (result.rateLimited) {
          setRateLimitError(result.message || t.rateLimitWarning)
          setSuggestions([])
          setIsOpen(false)
          return
        }

        if (result.fallback) {
          setIsFallbackMode(true)
          setSuggestions([])
          setIsOpen(false)
          return
        }

        if (result.suggestions && result.suggestions.length > 0) {
          setSuggestions(result.suggestions)
          setIsOpen(true)
        } else {
          setSuggestions([])
          setIsOpen(false)
        }
      } catch {
        // Fallback gracefully on any unexpected network exception
        setSuggestions([])
        setIsOpen(false)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 400) // 400ms debounce

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, isFallbackMode, t.rateLimitWarning])

  const handleSelectSuggestion = (s: LocationSuggestion) => {
    setQuery(s.address)
    onVenueNameChange(s.name)
    onLocationChange(s.address)
    setSuggestions([])
    setIsOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onVenueNameChange('')
    onLocationChange('')
    setSuggestions([])
    setIsOpen(false)
    setRateLimitError(null)
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={`relative backdrop-blur-md border rounded-xl p-3 flex flex-col gap-2 transition-all ${
        isDarkMode
          ? 'bg-white/[0.04] border-white/[0.09]'
          : 'bg-white/85 border-neutral-200/90 shadow-sm'
      }`}
    >
      {/* Title & Organization Type Badge */}
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

      {/* Main text input field (allows seamless manual typing without friction) */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={t.placeholder}
          className={`w-full border rounded-xl py-2.5 pl-3 pr-16 text-xs font-semibold focus:outline-none transition-all ${
            isDarkMode
              ? 'bg-[#141416] border-white/10 text-white placeholder:text-white/30 focus:border-orange-500/50'
              : 'bg-white border-neutral-300 text-neutral-800 placeholder:text-neutral-400 focus:border-orange-500/50'
          }`}
        />

        {/* Action icons */}
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

      {/* Rate limit warning message (Displayed if user triggers 24h block or rate limit) */}
      {rateLimitError && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-500 animate-fadeIn">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-medium leading-normal">{rateLimitError}</span>
        </div>
      )}

      {/* Daily quota fallback notice */}
      {isFallbackMode && (
        <p className={`text-[10px] font-medium leading-normal ${isDarkMode ? 'text-amber-400/80' : 'text-amber-700'}`}>
          💡 {t.fallbackNotice}
        </p>
      )}

      {/* Floating Suggestions Dropdown (Only appears when user has typed >= 3 chars and valid suggestions exist) */}
      {isOpen && suggestions.length > 0 && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl animate-fadeIn ${
            isDarkMode
              ? 'bg-[#18181b]/98 border-white/12 text-white shadow-black/70'
              : 'bg-white/98 border-neutral-200 text-neutral-900 shadow-neutral-900/20'
          }`}
        >
          <div className="max-h-56 overflow-y-auto py-1 divide-y divide-neutral-100 dark:divide-white/[0.05]">
            {suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition cursor-pointer ${
                  isDarkMode ? 'hover:bg-white/[0.08]' : 'hover:bg-orange-50/60'
                }`}
              >
                <div className="p-1 rounded-md bg-orange-500/10 text-orange-500 shrink-0 mt-0.5">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate text-orange-500">{item.name}</p>
                  <p className={`text-[10px] leading-relaxed truncate mt-0.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {item.address}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
