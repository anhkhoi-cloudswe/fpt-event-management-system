const cleanLocationToken = (value?: string | null) => {
  const trimmed = (value || '').trim()
  if (!trimmed || /^null$/i.test(trimmed) || /^undefined$/i.test(trimmed)) return ''
  if (/^https?:\/\//i.test(trimmed)) return ''
  return trimmed
}

export const formatEventLocation = (
  event: {
    areaName?: string
    area_name?: string
    floor?: string
    venueLocation?: string
    location?: string
    venueName?: string
    eventFormat?: string
  },
  lang: 'vi' | 'en' = 'vi'
) => {
  const format = (event.eventFormat || '').toUpperCase()
  if (format === 'ONLINE') {
    return lang === 'en' ? 'Online' : 'Trực tuyến'
  }

  const parts: string[] = []
  const area = event.areaName || event.area_name
  if (area) {
    parts.push(lang === 'en' ? `Area: ${area}` : `Khu vực: ${area}`)
  }
  if (event.floor) {
    const cleanFloor = /^(tầng|floor)/i.test(event.floor.trim())
      ? event.floor.trim()
      : (lang === 'en' ? `Floor ${event.floor.trim()}` : `Tầng ${event.floor.trim()}`)
    parts.push(cleanFloor)
  }

  const localText = parts.join(', ')
  const mainLoc = event.venueLocation || event.location || event.venueName || ''

  if (format === 'HYBRID') {
    const onsiteStr = localText && mainLoc ? `${localText} – ${mainLoc}` : (localText || mainLoc)
    return lang === 'en'
      ? `Online & Onsite (${onsiteStr})`
      : `Trực tuyến & Trực tiếp (${onsiteStr})`
  }

  if (localText && mainLoc) {
    return `${localText} – ${mainLoc}`
  }
  return localText || mainLoc || (lang === 'en' ? 'TBD' : 'Chưa xác định')
}

export const getCleanedLocationForMap = (exactLocationString?: string | null, venueName?: string | null) => {
  const loc = cleanLocationToken(exactLocationString)
  const name = cleanLocationToken(venueName)
  
  // Use exact location if available, otherwise fallback to venue name
  let target = loc || name || ''
  
  // Clean any leading digits and hyphen, e.g., "2 - FPT University Campus" -> "FPT University Campus"
  target = target.replace(/^\d+\s*-\s*/, '').trim()
  
  return target
}
