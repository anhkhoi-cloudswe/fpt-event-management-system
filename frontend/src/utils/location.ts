const cleanLocationToken = (value?: string | null) => {
  const trimmed = (value || '').trim()
  if (!trimmed || /^null$/i.test(trimmed) || /^undefined$/i.test(trimmed) || trimmed === '-') return ''
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
    customVenueName?: string | null
    customLocation?: string | null
    onlineMeetingUrl?: string | null
  },
  lang: 'vi' | 'en' = 'vi'
) => {
  const format = (event.eventFormat || '').toUpperCase()

  // 1. Resolve online platform label
  const customVenue = (event.customVenueName || '').trim()
  const meetingUrl = (event.onlineMeetingUrl || '').trim()
  let onlinePlatform = ''
  if (/zoom/i.test(customVenue) || /zoom/i.test(meetingUrl)) {
    onlinePlatform = 'Zoom'
  } else if (/meet|google/i.test(customVenue) || /meet|google/i.test(meetingUrl)) {
    onlinePlatform = 'Google Meet'
  } else if (customVenue && !/^tbd$/i.test(customVenue) && !/^chưa xác định$/i.test(customVenue)) {
    onlinePlatform = customVenue
  } else {
    onlinePlatform = lang === 'en' ? 'Online' : 'Trực tuyến'
  }

  if (format === 'ONLINE') {
    return onlinePlatform
  }

  // 2. Resolve offline location details
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
  const mainLoc = event.venueLocation || event.location || event.venueName || event.customLocation || ''
  const offlineVenueName = event.customVenueName && !/zoom|meet|google|trực tuyến|online/i.test(event.customVenueName)
    ? event.customVenueName
    : ''

  let onsiteStr = ''
  if (localText && mainLoc) {
    onsiteStr = `${localText} – ${mainLoc}`
  } else if (offlineVenueName && mainLoc && !mainLoc.includes(offlineVenueName)) {
    onsiteStr = `${offlineVenueName} – ${mainLoc}`
  } else {
    onsiteStr = localText || mainLoc || offlineVenueName || ''
  }

  // 3. HYBRID combines online platform and offline location
  if (format === 'HYBRID') {
    if (onsiteStr) {
      return `${onlinePlatform} & ${onsiteStr}`
    }
    return onlinePlatform
  }

  // 4. ONSITE or format fallback
  if (onsiteStr) {
    return onsiteStr
  }

  // If format is unspecified but has online meeting url or online platform
  if (meetingUrl || /zoom|meet|google/i.test(customVenue)) {
    return onlinePlatform
  }

  return lang === 'en' ? 'TBD' : 'Chưa xác định'
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
