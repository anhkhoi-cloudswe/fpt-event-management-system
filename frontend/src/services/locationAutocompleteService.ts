export type LocationSuggestion = {
  id: string
  name: string
  address: string
  lat: string
  lon: string
  mapUrl: string
}

export type SearchLocationsResult = {
  suggestions: LocationSuggestion[]
  fallback: boolean
  rateLimited: boolean
  message?: string
}

/**
 * Search locations via backend Goong.io rate-limited proxy.
 * Enforces:
 * - Minimum 3 characters requirement
 * - Server-side Throttling (Max 700 req/day global, 4 RPS, 1 req/2s per user, 30 req/day per user)
 * - Automatic fallback to manual typing if quota exhausted or rate-limited
 */
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<SearchLocationsResult> {
  const trimmed = query.trim()

  // 1. Min-length requirement: Only trigger API if at least 3 characters
  if (trimmed.length < 3) {
    return {
      suggestions: [],
      fallback: false,
      rateLimited: false,
    }
  }

  try {
    const res = await fetch(`/api/v1/places/autocomplete?input=${encodeURIComponent(trimmed)}`, {
      method: 'GET',
      signal,
      headers: {
        'Accept': 'application/json',
      },
    })

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}))
      return {
        suggestions: [],
        fallback: false,
        rateLimited: true,
        message: errData.message || 'Bạn đã thực hiện quá nhiều thao tác tìm kiếm địa chỉ. Vui lòng thử lại sau.',
      }
    }

    if (!res.ok) {
      return {
        suggestions: [],
        fallback: true,
        rateLimited: false,
        message: 'Không thể kết nối máy chủ bản đồ. Vui lòng nhập tay địa chỉ.',
      }
    }

    const data = await res.json()

    // 2. Check if server signaled daily cap reached or fallback mode
    if (data.fallback) {
      return {
        suggestions: [],
        fallback: true,
        rateLimited: false,
        message: data.message || 'Hạn mức tra cứu tự động đã đạt giới hạn. Vui lòng nhập tay địa chỉ.',
      }
    }

    // 3. Map Goong.io predictions format
    const predictions = Array.isArray(data.predictions) ? data.predictions : []
    const mapped: LocationSuggestion[] = predictions.map((p: any) => {
      const mainText = p.structured_formatting?.main_text || p.description?.split(',')[0] || p.description || ''
      const address = p.description || p.structured_formatting?.secondary_text || mainText
      return {
        id: p.place_id || `goong-${Math.random()}`,
        name: mainText,
        address: address,
        lat: '',
        lon: '',
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      }
    })

    return {
      suggestions: mapped,
      fallback: false,
      rateLimited: false,
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { suggestions: [], fallback: false, rateLimited: false }
    }
    // Network or server offline -> graceful fallback to manual input
    return {
      suggestions: [],
      fallback: true,
      rateLimited: false,
      message: 'Không thể tải gợi ý địa chỉ. Bạn có thể tự do gõ trực tiếp địa chỉ vào ô.',
    }
  }
}
