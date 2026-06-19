export type LocationSuggestion = {
  id: string
  name: string
  address: string
  lat: string
  lon: string
  mapUrl: string
}

type Language = 'vi' | 'en'

declare global {
  interface Window {
    google?: any
  }
}

type NominatimPlace = {
  place_id: number
  name?: string
  display_name: string
  lat: string
  lon: string
  address?: {
    attraction?: string
    building?: string
    hotel?: string
    office?: string
    amenity?: string
    tourism?: string
    shop?: string
    house_number?: string
    road?: string
    suburb?: string
    quarter?: string
    city?: string
    town?: string
    county?: string
    state?: string
    country?: string
  }
}

type PhotonFeature = {
  type: 'Feature'
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: {
    osm_id?: number
    name?: string
    street?: string
    district?: string
    city?: string
    county?: string
    state?: string
    country?: string
  }
}

type PhotonResponse = {
  features?: PhotonFeature[]
}

const POPULAR_VN_LOCATIONS: LocationSuggestion[] = [
  {
    id: 'popular-landmark-81',
    name: 'Landmark 81',
    address: 'Đường Điện Biên Phủ, Vinhomes Central Park, Bình Thạnh, Hồ Chí Minh',
    lat: '10.7950',
    lon: '106.7218',
    mapUrl: 'https://www.openstreetmap.org/search?query=Landmark%2081%20Ho%20Chi%20Minh',
  },
  {
    id: 'popular-landmark-6',
    name: 'Landmark 6',
    address: 'Đường Điện Biên Phủ, Vinhomes Central Park, Bình Thạnh, Hồ Chí Minh',
    lat: '10.7947',
    lon: '106.7206',
    mapUrl: 'https://www.openstreetmap.org/search?query=Landmark%206%20Vinhomes%20Central%20Park',
  },
  {
    id: 'popular-landmark-2',
    name: 'Landmark 2',
    address: 'Đường Điện Biên Phủ, Vinhomes Central Park, Bình Thạnh, Hồ Chí Minh',
    lat: '10.7939',
    lon: '106.7198',
    mapUrl: 'https://www.openstreetmap.org/search?query=Landmark%202%20Vinhomes%20Central%20Park',
  },
  {
    id: 'popular-landmark-3',
    name: 'Landmark 3',
    address: 'Vinhomes Central Park, Bình Thạnh, Hồ Chí Minh',
    lat: '10.7941',
    lon: '106.7200',
    mapUrl: 'https://www.openstreetmap.org/search?query=Landmark%203%20Vinhomes%20Central%20Park',
  },
  {
    id: 'popular-aeon-binh-tan',
    name: 'AEON MALL Bình Tân',
    address: 'Đường Số 17A, An Lạc, Bình Tân, Hồ Chí Minh',
    lat: '10.7422',
    lon: '106.6127',
    mapUrl: 'https://www.openstreetmap.org/search?query=AEON%20MALL%20Binh%20Tan',
  },
  {
    id: 'popular-aeon-tan-phu',
    name: 'AEON MALL Tân Phú Celadon',
    address: 'Đường Tân Thắng, Sơn Kỳ, Tân Phú, Hồ Chí Minh',
    lat: '10.8012',
    lon: '106.6181',
    mapUrl: 'https://www.openstreetmap.org/search?query=AEON%20MALL%20Tan%20Phu%20Celadon',
  },
  {
    id: 'popular-aeon-binh-duong',
    name: 'AEON MALL Bình Dương Canary',
    address: 'Đại lộ Bình Dương, Thuận Giao, Thuận An, Bình Dương',
    lat: '10.9319',
    lon: '106.7110',
    mapUrl: 'https://www.openstreetmap.org/search?query=AEON%20MALL%20Binh%20Duong%20Canary',
  },
  {
    id: 'popular-aeon-da-nang',
    name: 'AEON MALL Đà Nẵng',
    address: 'Chính Gián, Thanh Khê, Đà Nẵng',
    lat: '16.0678',
    lon: '108.1929',
    mapUrl: 'https://www.openstreetmap.org/search?query=AEON%20MALL%20Da%20Nang',
  },
  {
    id: 'popular-adora-art-hotel',
    name: 'Adora Art Hotel',
    address: 'Lý Tự Trọng, Bến Thành, Quận 1, Hồ Chí Minh',
    lat: '10.7756',
    lon: '106.6978',
    mapUrl: 'https://www.openstreetmap.org/search?query=Adora%20Art%20Hotel%20Ho%20Chi%20Minh',
  },
  {
    id: 'popular-tan-dinh-church',
    name: 'Nhà thờ Tân Định',
    address: '289 Hai Bà Trưng, Phường 8, Quận 3, Hồ Chí Minh',
    lat: '10.7882',
    lon: '106.6907',
    mapUrl: 'https://www.openstreetmap.org/search?query=Nha%20tho%20Tan%20Dinh%20Ho%20Chi%20Minh',
  },
  {
    id: 'popular-tan-dinh-market',
    name: 'Chợ Tân Định',
    address: 'Hai Bà Trưng, Tân Định, Quận 1, Hồ Chí Minh',
    lat: '10.7905',
    lon: '106.6904',
    mapUrl: 'https://www.openstreetmap.org/search?query=Cho%20Tan%20Dinh%20Ho%20Chi%20Minh',
  },
]

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

let googlePlacesPromise: Promise<void> | null = null

const loadGooglePlaces = (language: Language) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) return Promise.reject(new Error('Google Maps API key is not configured'))
  if (window.google?.maps?.places) return Promise.resolve()
  if (googlePlacesPromise) return googlePlacesPromise

  googlePlacesPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-places-loader="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Places')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=${language}&region=VN`
    script.async = true
    script.defer = true
    script.dataset.googlePlacesLoader = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Places'))
    document.head.appendChild(script)
  })

  return googlePlacesPromise
}

const fetchGooglePlaces = async (query: string, language: Language, signal?: AbortSignal): Promise<LocationSuggestion[]> => {
  await loadGooglePlaces(language)
  if (signal?.aborted) return []

  const service = new window.google.maps.places.AutocompleteService()
  const predictions = await new Promise<any[]>((resolve) => {
    service.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: 'vn' },
      },
      (results: any[] | null, status: string) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) {
          resolve([])
          return
        }
        resolve(results)
      },
    )
  })

  return predictions.slice(0, 8).map((place) => {
    const name = place.structured_formatting?.main_text || place.description
    const address = place.description || name
    return {
      id: `google-${place.place_id}`,
      name,
      address,
      lat: '',
      lon: '',
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}&query_place_id=${encodeURIComponent(place.place_id)}`,
    }
  })
}

const buildMapUrl = (lat: string, lon: string, query?: string) => {
  if (lat && lon) {
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`
  }

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query || '')}`
}

const buildReadableName = (place: NominatimPlace) => {
  const address = place.address || {}
  const fallback = place.display_name.split(',')[0]?.trim()
  return (
    place.name?.trim() ||
    address.attraction ||
    address.building ||
    address.hotel ||
    address.office ||
    address.amenity ||
    address.tourism ||
    address.shop ||
    fallback ||
    'Địa điểm'
  )
}

const buildPhotonAddress = (properties: PhotonFeature['properties']) => {
  if (!properties) return ''

  return [
    properties.street,
    properties.district,
    properties.city,
    properties.county,
    properties.state,
    properties.country,
  ]
    .filter(Boolean)
    .join(', ')
}

const toPhotonSuggestion = (feature: PhotonFeature): LocationSuggestion | null => {
  const coordinates = feature.geometry?.coordinates
  const properties = feature.properties
  const name = properties?.name?.trim()
  if (!coordinates || !name) return null

  const lon = String(coordinates[0])
  const lat = String(coordinates[1])
  const address = buildPhotonAddress(properties) || name

  return {
    id: `photon-${properties?.osm_id || `${lat}-${lon}-${name}`}`,
    name,
    address,
    lat,
    lon,
    mapUrl: buildMapUrl(lat, lon, `${name} ${address}`),
  }
}

const rankSuggestion = (suggestion: LocationSuggestion, query: string) => {
  const haystack = normalize(`${suggestion.name} ${suggestion.address}`)
  const name = normalize(suggestion.name)
  const needle = normalize(query)
  const hcmBoost = /ho chi minh|hcm|sai gon|saigon/.test(haystack) ? -3.5 : 0

  if (name === needle) return 0 + hcmBoost
  if (name.startsWith(needle)) return 1 + hcmBoost
  if (haystack.startsWith(needle)) return 2 + hcmBoost
  if (name.includes(needle)) return 3 + hcmBoost
  if (haystack.includes(needle)) return 4 + hcmBoost
  return 8
}

const getSignificantTokens = (query: string) => {
  const stopWords = new Set(['o', 'tai', 'dia', 'diem', 'duong', 'phuong', 'quan', 'tp', 'thanh', 'pho'])
  return normalize(query)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token))
}

const isRelevantSuggestion = (suggestion: LocationSuggestion, query: string) => {
  const needle = normalize(query)
  const haystack = normalize(`${suggestion.name} ${suggestion.address}`)
  const tokens = getSignificantTokens(query)
  const requiredIntentTokens = ['sach', 'tho', 'cafe', 'hotel', 'mall', 'cho', 'truong', 'benh', 'vien']
    .filter((token) => tokens.includes(token))

  if (requiredIntentTokens.some((token) => !haystack.includes(token))) {
    return false
  }

  if (!needle || tokens.length <= 1) return true
  if (haystack.includes(needle)) return true

  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length
  const requiredMatches = tokens.length <= 3 ? tokens.length : Math.ceil(tokens.length * 0.75)
  return matchedTokens >= requiredMatches
}

const dedupeAndRank = (items: LocationSuggestion[], query: string) => {
  const seen = new Set<string>()
  const seenNames = new Set<string>()

  return items
    .filter((item) => isRelevantSuggestion(item, query))
    .filter((item) => {
      const nameKey = normalize(item.name)
      const key = normalize(`${item.name}|${item.address}`)
      if (seen.has(key) || seenNames.has(nameKey)) return false
      seen.add(key)
      seenNames.add(nameKey)
      return true
    })
    .sort((a, b) => rankSuggestion(a, query) - rankSuggestion(b, query))
    .slice(0, 12)
}

const searchPopularLocations = (query: string) => {
  const needle = normalize(query)
  if (!needle) return []

  return POPULAR_VN_LOCATIONS.filter((item) => {
    const haystack = normalize(`${item.name} ${item.address}`)
    return haystack.includes(needle)
  })
}

const fetchPhotonLocations = async (query: string, language: Language, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    q: query,
    limit: '12',
    lang: language === 'en' ? 'en' : 'vi',
    lat: '10.7769',
    lon: '106.7009',
  })

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) return []

  const data = (await response.json()) as PhotonResponse
  return (data.features || [])
    .map(toPhotonSuggestion)
    .filter((item): item is LocationSuggestion => Boolean(item))
}

const fetchNominatimLocations = async (query: string, language: Language, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '12',
    countrycodes: 'vn',
    'accept-language': language === 'en' ? 'en' : 'vi',
  })

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) return []

  const data = (await response.json()) as NominatimPlace[]
  return data.map((place) => ({
    id: `nominatim-${place.place_id}`,
    name: buildReadableName(place),
    address: place.display_name,
    lat: place.lat,
    lon: place.lon,
    mapUrl: buildMapUrl(place.lat, place.lon, place.display_name),
  }))
}

const fetchNominatimVariants = async (query: string, language: Language, signal?: AbortSignal) => {
  const variants = Array.from(new Set([
    query,
    `${query} Hồ Chí Minh`,
    `${query} TP Hồ Chí Minh`,
    `${query} Việt Nam`,
  ]))

  const settled = await Promise.allSettled(
    variants.map((variant) => fetchNominatimLocations(variant, language, signal)),
  )

  return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
}

export async function searchLocations(
  query: string,
  language: Language = 'vi',
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const localResults = searchPopularLocations(trimmed)

  const providerTasks = [
    fetchGooglePlaces(trimmed, language, signal),
    fetchPhotonLocations(trimmed, language, signal),
    trimmed.length > 1 ? fetchNominatimVariants(trimmed, language, signal) : Promise.resolve([]),
  ]

  const settled = await Promise.allSettled(providerTasks)
  const remoteResults = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])

  return dedupeAndRank([...localResults, ...remoteResults], trimmed)
}
