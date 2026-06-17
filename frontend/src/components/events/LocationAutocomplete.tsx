import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { searchLocations, type LocationSuggestion } from '../../services/locationAutocompleteService'

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
    label: 'Nhập địa chỉ sự kiện',
    placeholder: 'Nhập địa chỉ sự kiện',
    use: 'Dùng',
    customAddress: 'Địa chỉ tùy chỉnh',
    loadingError: 'Chưa tải được gợi ý địa điểm',
  },
  en: {
    label: 'Enter event location',
    placeholder: 'Enter event location',
    use: 'Use',
    customAddress: 'Custom address',
    loadingError: 'Could not load location suggestions',
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
  const text = copy[language]
  const [query, setQuery] = useState(location || venueName)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQuery(location || venueName)
  }, [location, venueName])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isExpanded) return

    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [isExpanded])

  useEffect(() => {
    const trimmed = query.trim()
    if (!isExpanded || trimmed.length < 2) {
      setSuggestions([])
      setIsLoading(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setIsLoading(true)
        setSearchError(null)
        const results = await searchLocations(trimmed, language, controller.signal)
        setSuggestions(results)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Location autocomplete failed:', error)
        setSuggestions([])
        setSearchError(text.loadingError)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 260)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [isExpanded, language, query, text.loadingError])

  const hasQuery = query.trim().length > 0
  const preview = useMemo(() => location || venueName || '', [location, venueName])
  const triggerText = isExpanded ? text.label : preview || text.label

  const handleManualLocationChange = (value: string) => {
    setQuery(value)
    onLocationChange(value)
    onVenueNameChange(value)
  }

  const handleSelect = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.address)
    onVenueNameChange(suggestion.name)
    onLocationChange(suggestion.address)
    setSuggestions([])
    setSearchError(null)
    setIsExpanded(false)
  }

  const handleUseQuery = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    onVenueNameChange(trimmed)
    onLocationChange(trimmed)
    setSuggestions([])
    setSearchError(null)
    setIsExpanded(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={`flex w-full items-center justify-between gap-3 px-0 py-1.5 text-left transition ${
          isDarkMode ? 'text-white/70 hover:text-white' : 'text-neutral-700 hover:text-neutral-950'
        }`}
      >
        <span className="min-w-0 truncate text-sm font-medium">{triggerText}</span>
        {!isExpanded && preview && <MapPin className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-white/35' : 'text-neutral-400'}`} />}
      </button>

      {isExpanded && (
        <div
          className={`absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border shadow-xl ${
            isDarkMode
              ? 'border-white/10 bg-[#18181b] text-white shadow-black/40'
              : 'border-neutral-200 bg-white text-neutral-950 shadow-neutral-900/10'
          }`}
        >
          <div className={`relative border-b ${isDarkMode ? 'border-white/10' : 'border-neutral-200'}`}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => handleManualLocationChange(event.target.value)}
              placeholder={text.placeholder}
              className={`h-16 w-full bg-transparent px-4 pr-11 text-sm font-medium outline-none ${
                isDarkMode ? 'placeholder:text-white/35' : 'placeholder:text-neutral-400'
              }`}
            />
            <div className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-white/40' : 'text-neutral-400'}`}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </div>
          </div>

          {(hasQuery || suggestions.length > 0 || searchError) && (
            <div className="max-h-80 overflow-y-auto py-2">
              {hasQuery && (
                <button
                  type="button"
                  onClick={handleUseQuery}
                  className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                    isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-neutral-50'
                  }`}
                >
                  <MapPin className={`mt-0.5 h-5 w-5 shrink-0 ${isDarkMode ? 'text-white/45' : 'text-neutral-500'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{text.use} &quot;{query.trim()}&quot;</span>
                    <span className={`mt-0.5 block text-xs ${isDarkMode ? 'text-white/40' : 'text-neutral-400'}`}>{text.customAddress}</span>
                  </span>
                </button>
              )}

              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${
                    isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-neutral-50'
                  }`}
                >
                  <MapPin className={`mt-0.5 h-5 w-5 shrink-0 ${isDarkMode ? 'text-white/45' : 'text-neutral-500'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{suggestion.name}</span>
                    <span className={`mt-0.5 block truncate text-xs ${isDarkMode ? 'text-white/40' : 'text-neutral-400'}`}>{suggestion.address}</span>
                  </span>
                </button>
              ))}

              {searchError && (
                <div className={`px-4 py-2 text-xs font-medium ${isDarkMode ? 'text-amber-200/80' : 'text-amber-700'}`}>
                  {searchError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
