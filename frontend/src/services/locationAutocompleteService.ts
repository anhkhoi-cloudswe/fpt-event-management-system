export type LocationSuggestion = {
  id: string
  name: string
  address: string
  lat: string
  lon: string
  mapUrl: string
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
    'Dia diem'
  )
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'vn',
    'accept-language': 'vi',
  })

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Khong the tai goi y dia diem')
  }

  const data = (await response.json()) as NominatimPlace[]
  return data.map((place) => ({
    id: String(place.place_id),
    name: buildReadableName(place),
    address: place.display_name,
    lat: place.lat,
    lon: place.lon,
    mapUrl: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(place.lat)}&mlon=${encodeURIComponent(place.lon)}#map=17/${encodeURIComponent(place.lat)}/${encodeURIComponent(place.lon)}`,
  }))
}
