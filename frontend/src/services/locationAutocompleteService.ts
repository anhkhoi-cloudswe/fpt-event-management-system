export type LocationSuggestion = {
  id: string
  name: string
  address: string
  lat: string
  lon: string
  mapUrl: string
  isPopular?: boolean
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
    id: 'popular-bitexco',
    name: 'Tòa nhà Bitexco Financial Tower',
    address: '02 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7718',
    lon: '106.7044',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Bitexco%20Financial%20Tower%20Ho%20Chi%20Minh',
    isPopular: true,
  },
  {
    id: 'popular-landmark-81',
    name: 'Tòa nhà Vincom Landmark 81',
    address: '720A Điện Biên Phủ, Vinhomes Central Park, Phường 22, Bình Thạnh, TP. Hồ Chí Minh',
    lat: '10.7950',
    lon: '106.7218',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Landmark%2081%20Ho%20Chi%20Minh',
    isPopular: true,
  },
  {
    id: 'popular-gem-center',
    name: 'Trung tâm sự kiện GEM Center',
    address: '8 Nguyễn Bỉnh Khiêm, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7876',
    lon: '106.7011',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=GEM%20Center',
    isPopular: true,
  },
  {
    id: 'popular-white-palace-pvd',
    name: 'Trung tâm Triển lãm & Hội nghị White Palace',
    address: '588 Phạm Văn Đồng, Phường Hiệp Bình Chánh, TP. Thủ Đức, TP. Hồ Chí Minh',
    lat: '10.8252',
    lon: '106.7289',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=White%20Palace%20Pham%20Van%20Dong',
    isPopular: true,
  },
  {
    id: 'popular-white-palace-hvt',
    name: 'Trung tâm Hội nghị White Palace Hoàng Văn Thụ',
    address: '194 Hoàng Văn Thụ, Phường 9, Phú Nhuận, TP. Hồ Chí Minh',
    lat: '10.7995',
    lon: '106.6711',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=White%20Palace%20Hoang%20Van%20Thu',
    isPopular: true,
  },
  {
    id: 'popular-adora-center',
    name: 'Trung tâm Hội nghị The Adora Center',
    address: '431 Hoàng Văn Thụ, Phường 4, Tân Bình, TP. Hồ Chí Minh',
    lat: '10.7989',
    lon: '106.6575',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=The%20Adora%20Center',
    isPopular: true,
  },
  {
    id: 'popular-adora-dynasty',
    name: 'The Adora Dynasty',
    address: '1A Tôn Thất Tùng, Phường Phạm Ngũ Lão, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7702',
    lon: '106.6895',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=The%20Adora%20Dynasty',
    isPopular: true,
  },
  {
    id: 'popular-secc',
    name: 'Trung tâm Hội chợ và Triển lãm Sài Gòn (SECC)',
    address: '799 Nguyễn Văn Linh, Phường Tân Phú, Quận 7, TP. Hồ Chí Minh',
    lat: '10.7303',
    lon: '106.7215',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=SECC%20Saigon',
    isPopular: true,
  },
  {
    id: 'popular-saigon-centre',
    name: 'Saigon Centre / Takashimaya',
    address: '65 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7735',
    lon: '106.7010',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Saigon%20Centre',
    isPopular: true,
  },
  {
    id: 'popular-vincom-dong-khoi',
    name: 'Vincom Center Đồng Khởi',
    address: '72 Lê Thánh Tôn & 45A Lý Tự Trọng, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7781',
    lon: '106.7018',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Vincom%20Center%20Dong%20Khoi',
    isPopular: true,
  },
  {
    id: 'popular-fpt-hcm',
    name: 'Đại học FPT TP. Hồ Chí Minh',
    address: 'Đường D1, Khu Công nghệ cao, Phường Long Thạnh Mỹ, TP. Thủ Đức, TP. Hồ Chí Minh',
    lat: '10.8412',
    lon: '106.8099',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dai%20hoc%20FPT%20TP%20Ho%20Chi%20Minh',
    isPopular: true,
  },
  {
    id: 'popular-fpt-hoa-lac',
    name: 'Đại học FPT Hà Nội (Hòa Lạc)',
    address: 'Khu Giáo dục và Đào tạo, Khu Công nghệ cao Hòa Lạc, Km29 Đại lộ Thăng Long, Thạch Thất, Hà Nội',
    lat: '21.0125',
    lon: '105.5268',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dai%20hoc%20FPT%20Hoa%20Lac',
    isPopular: true,
  },
  {
    id: 'popular-fpt-da-nang',
    name: 'Đại học FPT Đà Nẵng',
    address: 'Khu đô thị FPT City Đà Nẵng, Phường Hòa Hải, Quận Ngũ Hành Sơn, Đà Nẵng',
    lat: '15.9696',
    lon: '108.2612',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dai%20hoc%20FPT%20Da%20Nang',
    isPopular: true,
  },
  {
    id: 'popular-fpt-can-tho',
    name: 'Đại học FPT Cần Thơ',
    address: 'Số 600, đường Nguyễn Văn Cừ (nối dài), Phường An Bình, Quận Ninh Kiều, Cần Thơ',
    lat: '10.0123',
    lon: '105.7335',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dai%20hoc%20FPT%20Can%20Tho',
    isPopular: true,
  },
  {
    id: 'popular-fpt-quy-nhon',
    name: 'Đại học FPT Quy Nhơn',
    address: 'Khu đô thị mới An Phú Thịnh, Phường Đống Đa, TP. Quy Nhơn, Bình Định',
    lat: '13.7915',
    lon: '109.2198',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Dai%20hoc%20FPT%20Quy%20Nhon',
    isPopular: true,
  },
  {
    id: 'popular-quang-trung-software-city',
    name: 'Công viên Phần mềm Quang Trung (QTSC)',
    address: 'Tô Ký, Tân Chánh Hiệp, Quận 12, TP. Hồ Chí Minh',
    lat: '10.8543',
    lon: '106.6268',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Cong%20vien%20Phan%20mem%20Quang%20Trung',
    isPopular: true,
  },
  {
    id: 'popular-aeon-binh-tan',
    name: 'AEON MALL Bình Tân',
    address: 'Số 1 Đường Số 17A, Bình Trị Đông B, Bình Tân, TP. Hồ Chí Minh',
    lat: '10.7422',
    lon: '106.6127',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=AEON%20MALL%20Binh%20Tan',
    isPopular: true,
  },
  {
    id: 'popular-aeon-tan-phu',
    name: 'AEON MALL Tân Phú Celadon',
    address: '30 Đường Tân Thắng, Sơn Kỳ, Tân Phú, TP. Hồ Chí Minh',
    lat: '10.8012',
    lon: '106.6181',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=AEON%20MALL%20Tan%20Phu%20Celadon',
    isPopular: true,
  },
  {
    id: 'popular-ncc-hanoi',
    name: 'Trung tâm Hội nghị Quốc gia (NCC Hà Nội)',
    address: 'Cổng số 1 Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm, Hà Nội',
    lat: '21.0068',
    lon: '105.7876',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Trung%20tam%20Hoi%20nghi%20Quoc%20gia%20Ha%20Noi',
    isPopular: true,
  },
  {
    id: 'popular-queen-plaza',
    name: 'Trung tâm Hội nghị Queen Plaza Kỳ Hòa',
    address: '16A Lê Hồng Phong, Phường 12, Quận 10, TP. Hồ Chí Minh',
    lat: '10.7744',
    lon: '106.6745',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Queen%20Plaza%20Ky%20Hoa',
    isPopular: true,
  },
  {
    id: 'popular-intercon-saigon',
    name: 'InterContinental Saigon Hotel & Residences',
    address: 'Hai Bà Trưng & Lê Duẩn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7818',
    lon: '106.6997',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=InterContinental%20Saigon',
    isPopular: true,
  },
  {
    id: 'popular-sheraton-saigon',
    name: 'Sheraton Saigon Grand Opera Hotel',
    address: '88 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    lat: '10.7761',
    lon: '106.7042',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Sheraton%20Saigon',
    isPopular: true,
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

const loadGooglePlaces = (language: Language): Promise<void> => {
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

/**
 * Fetch Google Places with strict 2.5-second timeout protection so it never freezes
 * even if key is disabled or restricted.
 */
const fetchGooglePlaces = async (query: string, language: Language, signal?: AbortSignal): Promise<LocationSuggestion[]> => {
  try {
    const timeoutPromise = new Promise<LocationSuggestion[]>((resolve) => setTimeout(() => resolve([]), 2500))

    const taskPromise = (async (): Promise<LocationSuggestion[]> => {
      await loadGooglePlaces(language)
      if (signal?.aborted || !window.google?.maps?.places?.AutocompleteService) return []

      const service = new window.google.maps.places.AutocompleteService()
      return new Promise<LocationSuggestion[]>((resolve) => {
        const timeout = setTimeout(() => resolve([]), 2000)
        try {
          service.getPlacePredictions(
            {
              input: query,
              componentRestrictions: { country: 'vn' },
            },
            (results: any[] | null, status: string) => {
              clearTimeout(timeout)
              if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) {
                resolve([])
                return
              }
              resolve(
                results.slice(0, 8).map((place) => {
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
              )
            }
          )
        } catch {
          clearTimeout(timeout)
          resolve([])
        }
      })
    })()

    return await Promise.race([taskPromise, timeoutPromise])
  } catch {
    return []
  }
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
  const popularBoost = suggestion.isPopular ? -2.0 : 0

  if (name === needle) return 0 + hcmBoost + popularBoost
  if (name.startsWith(needle)) return 1 + hcmBoost + popularBoost
  if (haystack.startsWith(needle)) return 2 + hcmBoost + popularBoost
  if (name.includes(needle)) return 3 + hcmBoost + popularBoost
  if (haystack.includes(needle)) return 4 + hcmBoost + popularBoost
  return 8 + popularBoost
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
  if (!needle) return true
  if (haystack.includes(needle)) return true

  const tokens = getSignificantTokens(query)
  if (tokens.length <= 1) return true

  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length
  return matchedTokens >= Math.max(1, Math.ceil(tokens.length * 0.5))
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

/**
 * Synchronous local match for instant 0ms response when typing
 */
export function getInstantLocalSuggestions(query: string): LocationSuggestion[] {
  const needle = normalize(query.trim())
  if (!needle) return []

  return POPULAR_VN_LOCATIONS.filter((item) => {
    const haystack = normalize(`${item.name} ${item.address}`)
    return haystack.includes(needle)
  })
}

const fetchPhotonLocations = async (query: string, language: Language, signal?: AbortSignal) => {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '12',
      lat: '10.7769',
      lon: '106.7009',
    })
    if (language === 'en') {
      params.set('lang', 'en')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2800)
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) return []

    const data = (await response.json()) as PhotonResponse
    return (data.features || [])
      .map(toPhotonSuggestion)
      .filter((item): item is LocationSuggestion => Boolean(item))
  } catch {
    return []
  }
}

const fetchNominatimLocations = async (query: string, language: Language, signal?: AbortSignal) => {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '8',
      countrycodes: 'vn',
      'accept-language': language === 'en' ? 'en' : 'vi',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2800)
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
    clearTimeout(timeout)

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
  } catch {
    return []
  }
}

const fetchNominatimVariants = async (query: string, language: Language, signal?: AbortSignal) => {
  const variants = Array.from(new Set([
    query,
    `${query} Hồ Chí Minh`,
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

  const localResults = getInstantLocalSuggestions(trimmed)

  const providerTasks = [
    fetchGooglePlaces(trimmed, language, signal),
    fetchPhotonLocations(trimmed, language, signal),
    trimmed.length > 1 ? fetchNominatimVariants(trimmed, language, signal) : Promise.resolve([]),
  ]

  const settled = await Promise.allSettled(providerTasks)
  const remoteResults = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])

  return dedupeAndRank([...localResults, ...remoteResults], trimmed)
}
