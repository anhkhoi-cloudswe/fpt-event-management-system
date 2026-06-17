import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Loader2, MapPin, Navigation, Search, Sparkles } from 'lucide-react'
import { searchLocations, type LocationSuggestion } from '../../services/locationAutocompleteService'

type Props = {
  isDarkMode: boolean
  venueName: string
  location: string
  onVenueNameChange: (value: string) => void
  onLocationChange: (value: string) => void
}

export default function LocationAutocomplete({
  isDarkMode,
  venueName,
  location,
  onVenueNameChange,
  onLocationChange,
}: Props) {
  const [query, setQuery] = useState(location || venueName)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<LocationSuggestion | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedSuggestion) return
    setQuery(location || venueName)
  }, [location, venueName, selectedSuggestion])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
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
        const results = await searchLocations(trimmed, controller.signal)
        setSuggestions(results)
        setIsOpen(true)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Location autocomplete failed:', error)
        setSuggestions([])
        setSearchError('Chua lay duoc goi y tu ban do')
        setIsOpen(true)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 260)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query])

  const mapLink = useMemo(() => {
    if (selectedSuggestion?.mapUrl) return selectedSuggestion.mapUrl
    const fallback = location || query
    if (!fallback.trim()) return ''
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(fallback)}`
  }, [location, query, selectedSuggestion])

  const handleSelect = (suggestion: LocationSuggestion) => {
    setSelectedSuggestion(suggestion)
    setQuery(suggestion.address)
    onVenueNameChange(suggestion.name)
    onLocationChange(suggestion.address)
    setSuggestions([])
    setIsOpen(false)
    setSearchError(null)
  }

  const handleManualVenueChange = (value: string) => {
    setSelectedSuggestion(null)
    onVenueNameChange(value)
  }

  const handleManualLocationChange = (value: string) => {
    setSelectedSuggestion(null)
    setQuery(value)
    onLocationChange(value)
  }

  return (
    <div
      ref={wrapperRef}
      className={`rounded-2xl border p-3.5 shadow-[0_18px_60px_-36px_rgba(0,0,0,0.45)] ${
        isDarkMode ? 'border-white/[0.08] bg-white/[0.035]' : 'border-neutral-200 bg-white/90'
      }`}
    >
      <div className={`flex items-center justify-between gap-3 border-b pb-2.5 ${isDarkMode ? 'border-white/[0.06]' : 'border-neutral-200'}`}>
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${isDarkMode ? 'bg-orange-500/15 text-orange-300' : 'bg-orange-100 text-orange-600'}`}>
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDarkMode ? 'text-white/45' : 'text-neutral-500'}`}>Dia diem tu do</p>
            <p className={`text-[11px] font-medium ${isDarkMode ? 'text-white/70' : 'text-neutral-600'}`}>Tim goi y dia chi that tu ban do de dien nhanh va chinh xac.</p>
          </div>
        </div>
        {mapLink && (
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
              isDarkMode
                ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-white hover:text-neutral-900'
            }`}
          >
            <Navigation className="h-3.5 w-3.5" />
            Mo ban do
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/45' : 'text-neutral-500'}`}>
            <Search className="h-3.5 w-3.5 text-orange-400" />
            Tim dia chi
          </span>
          <div className={`relative overflow-hidden rounded-2xl border transition ${
            isOpen
              ? isDarkMode ? 'border-orange-400/45 ring-1 ring-orange-400/20' : 'border-orange-300 ring-1 ring-orange-200'
              : isDarkMode ? 'border-white/10 bg-[#141416]' : 'border-neutral-200 bg-neutral-50'
          }`}>
            <input
              type="text"
              value={query}
              onChange={(e) => handleManualLocationChange(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0 || searchError) setIsOpen(true)
              }}
              placeholder="Vi du: Adora Art Hotel, 63 Ly Tu Trong, Quan 1..."
              className={`w-full bg-transparent px-4 py-3 pr-10 text-sm font-medium outline-none ${
                isDarkMode ? 'text-white placeholder:text-white/30' : 'text-neutral-800 placeholder:text-neutral-400'
              }`}
            />
            <div className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-white/40' : 'text-neutral-400'}`}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </div>
          </div>
        </label>

        {isOpen && (suggestions.length > 0 || searchError) && (
          <div className={`overflow-hidden rounded-2xl border backdrop-blur-xl ${
            isDarkMode ? 'border-white/10 bg-[#19161d]/95 shadow-[0_24px_80px_-30px_rgba(0,0,0,0.85)]' : 'border-neutral-200 bg-white/95 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.22)]'
          }`}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                  isDarkMode ? 'border-white/5 hover:bg-white/6' : 'border-neutral-100 hover:bg-orange-50/70'
                } border-b last:border-b-0`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isDarkMode ? 'bg-white/6 text-white/70' : 'bg-neutral-100 text-neutral-500'}`}>
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-bold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{suggestion.name}</p>
                  <p className={`mt-0.5 line-clamp-2 text-xs leading-relaxed ${isDarkMode ? 'text-white/55' : 'text-neutral-500'}`}>{suggestion.address}</p>
                </div>
              </button>
            ))}
            {searchError && (
              <div className={`px-4 py-3 text-xs font-medium ${isDarkMode ? 'text-amber-200/80' : 'text-amber-700'}`}>{searchError}</div>
            )}
          </div>
        )}

        <label className="block">
          <span className={`mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] ${isDarkMode ? 'text-white/45' : 'text-neutral-500'}`}>
            Ten dia diem hien thi
          </span>
          <input
            type="text"
            value={venueName}
            onChange={(e) => handleManualVenueChange(e.target.value)}
            required
            placeholder="Ten se hien tren su kien"
            className={`w-full rounded-2xl border bg-transparent px-4 py-3 text-sm font-semibold outline-none transition ${
              isDarkMode
                ? 'border-white/10 bg-white/[0.03] text-white placeholder:text-white/30 focus:border-orange-400/45'
                : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400 focus:border-orange-300'
            }`}
          />
        </label>

        <div className={`rounded-2xl border px-3.5 py-3 ${
          isDarkMode ? 'border-white/8 bg-white/[0.025]' : 'border-orange-100 bg-orange-50/60'
        }`}>
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
            <div>
              <p className={`text-xs font-semibold ${isDarkMode ? 'text-white/75' : 'text-neutral-800'}`}>
                Chon goi y de tu dong dien ten dia diem va dia chi day du.
              </p>
              <p className={`mt-1 text-[11px] leading-relaxed ${isDarkMode ? 'text-white/45' : 'text-neutral-600'}`}>
                Ban van co the sua tay neu muon. Khi su kien duoc tao, nguoi xem se co thong tin dia diem ro rang hon va mo ban do nhanh hon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
