/**
 * dateFormat.ts - Pure String-based Timezone Handling (NO Date objects)
 * 
 * ✅ PHILOSOPHY: Use only string extraction - NO timezone interpretation
 * Backend returns RFC3339 with timezone: "2026-04-01T09:00:00+07:00"
 * Frontend extracts components via regex/substring - NO Date object creation
 * Result: Wall-clock time displayed exactly as stored (09:00 stays 09:00)
 */

/**
 * ✅ formatVietnamDateTime - Format RFC3339 string with custom pattern
 * Pure string extraction, NO Date objects or date-fns library
 * 
 * @param dateStr - RFC3339 string like "2026-04-01T09:00:00+07:00" or "2026-04-01 09:00:00"
 * @param formatPattern - Pattern like "dd/MM/yyyy HH:mm:ss" or "dd/MM/yyyy HH:mm"
 * @returns Formatted string like "01/04/2026 09:00:00"
 * 
 * CRITICAL: No Date object parsing - just regex extraction and string formatting
 */
export const formatVietnamDateTime = (dateStr: string | undefined | null, formatPattern: string = 'dd/MM/yyyy HH:mm:ss'): string => {
  if (!dateStr) return ''

  try {
    // Extract datetime components using regex
    // Handles: "2026-04-01T09:00:00+07:00" or "2026-04-01 09:00:00" or "2026-04-01T09:00:00Z"
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?/)
    if (!match) return ''

    const [, year, month, day, hours, minutes, secondsStr] = match
    const seconds = secondsStr || '00'

    // Build the formatted string based on the pattern
    let result = formatPattern
      .replace('yyyy', year)
      .replace('MM', month)
      .replace('dd', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)

    return result
  } catch (error) {
    console.error(`[formatVietnamDateTime] Error parsing "${dateStr}":`, error)
    return ''
  }
}

/**
 * ✅ extractTimeFromRFC3339 - Extract HH:mm from RFC3339 string
 * @param rfc3339Str - String like "2026-04-01T09:00:00+07:00"
 * @returns Time string "09:00"
 */
export const extractTimeFromRFC3339 = (rfc3339Str: string): string => {
  if (!rfc3339Str) return ''
  // Position 11-16 for ISO format (after "YYYY-MM-DDTHH:mm")
  if (rfc3339Str.length >= 16 && (rfc3339Str[10] === 'T' || rfc3339Str[10] === ' ')) {
    return rfc3339Str.substring(11, 16)
  }
  return ''
}

/**
 * ✅ extractDateFromRFC3339 - Extract YYYY-MM-DD from RFC3339 string
 * @param rfc3339Str - String like "2026-04-01T09:00:00+07:00"
 * @returns Date string "2026-04-01"
 */
export const extractDateFromRFC3339 = (rfc3339Str: string): string => {
  if (!rfc3339Str) return ''
  // Position 0-10 for ISO date format
  if (rfc3339Str.length >= 10) {
    return rfc3339Str.substring(0, 10)
  }
  return ''
}

/**
 * ✅ formatWallClockDateTimeSimple - Format DD/MM/YYYY HH:mm from RFC3339 string
 * Pure string extraction, NO Date objects
 * 
 * @param rfc3339Str - String like "2026-04-01T09:00:00+07:00"
 * @returns Formatted string "01/04/2026 09:00"
 */
export const formatWallClockDateTimeSimple = (rfc3339Str: string): string => {
  if (!rfc3339Str) return ''

  try {
    // Extract YYYY-MM-DD and HH:mm using regex
    const match = rfc3339Str.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    if (!match) return ''

    const [, year, month, day, hours, minutes] = match
    // Format as: DD/MM/YYYY HH:mm
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch (error) {
    console.error(`[formatWallClockDateTimeSimple] Error parsing "${rfc3339Str}":`, error)
    return ''
  }
}

/**
 * ✅ formatWallClockTimeFromRFC3339 - Format date+time from RFC3339 string
 * Alias for formatWallClockDateTimeSimple - uses same pure string extraction approach
 * 
 * @param rfc3339Str - String like "2026-04-01T09:00:00+07:00"
 * @returns Formatted string "01/04/2026 09:00"
 */
export const formatWallClockTimeFromRFC3339 = (rfc3339Str: string): string => {
  return formatWallClockDateTimeSimple(rfc3339Str)
}

/**
 * ✅ formatWallClockDateTimeWithDayOfWeek - Format date + day-of-week + time from RFC3339
 * Returns: "18/04/2026 • Thứ Năm • 14:00"
 * 
 * CRITICAL APPROACH:
 * 1. Extract date/time via pure string manipulation (NO timezone shifting)
 * 2. Create Date object ONLY for day-of-week calculation
 * 3. Use UTC-only date parsing to avoid browser timezone interpretation
 * 
 * @param rfc3339Str - String like "2026-04-18T14:00:00+07:00"
 * @returns Formatted string like "18/04/2026 • Thứ Năm • 14:00"
 */
export const formatWallClockDateTimeWithDayOfWeek = (rfc3339Str: string): string => {
  if (!rfc3339Str) return ''

  try {
    // Step 1: Extract date components via regex (pure string extraction - NO timezone effects)
    const match = rfc3339Str.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    if (!match) return ''

    const [, year, month, day, hours, minutes] = match
    const yearNum = parseInt(year, 10)
    const monthNum = parseInt(month, 10)
    const dayNum = parseInt(day, 10)

    // Step 2: Create UTC-only Date object for day-of-week calculation
    // Using UTC constructor ensures no browser timezone interpretation
    const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum))
    
    // Step 3: Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayOfWeekIndex = utcDate.getUTCDay()
    
    // Step 4: Map to Vietnamese day names
    const vietnamDayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
    const dayOfWeekName = vietnamDayNames[dayOfWeekIndex]

    // Step 5: Build final format: "DD/MM/YYYY • Thứ X • HH:mm"
    return `${day}/${month}/${year} • ${dayOfWeekName} • ${hours}:${minutes}`
  } catch (error) {
    console.error(`[formatWallClockDateTimeWithDayOfWeek] Error parsing "${rfc3339Str}":`, error)
    return ''
  }
}

/**
 * ✅ compareTimeStringsForEventStatus - Compare RFC3339 time strings
 * Determines if an event is currently ongoing or has ended
 * Pure string comparison, NO Date objects
 * 
 * @param currentTime - RFC3339 string (current time)
 * @param eventStart - RFC3339 string (event start time)
 * @param eventEnd - RFC3339 string (event end time)
 * @returns { eventOngoing: boolean, eventEnded: boolean }
 */
export const compareTimeStringsForEventStatus = (
  currentTime: string,
  eventStart: string,
  eventEnd: string
): { eventOngoing: boolean; eventEnded: boolean } => {
  if (!currentTime || !eventStart || !eventEnd) {
    return { eventOngoing: false, eventEnded: false }
  }

  // Extract datetime portion (remove timezone)
  // "2026-04-01T09:00:00+07:00" => "2026-04-01T09:00:00"
  const extractDateTime = (str: string) => str.split('+')[0].split('Z')[0]

  const current = extractDateTime(currentTime)
  const start = extractDateTime(eventStart)
  const end = extractDateTime(eventEnd)

  // String comparison works correctly for ISO 8601 format
  const eventOngoing = current >= start && current < end
  const eventEnded = current > end

  return { eventOngoing, eventEnded }
}

/**
 * @deprecated - OLD FUNCTION - DO NOT USE
 * Reason: Used new Date() which caused timezone shifting
 * Alternative: Use formatWallClockDateTimeSimple or formatVietnamDateTime instead
 */
export const parseVietnamTime = (__dateStr: string): Date => {
  console.warn('[parseVietnamTime] ❌ DEPRECATED - use string extraction instead')
  return new Date()
}

/**
 * @deprecated - OLD FUNCTION - DO NOT USE
 * Use formatVietnamDateTime instead
 */
export const formatVietnamDateTimeWithSeconds = (date: Date | string): string => {
  if (typeof date === 'string') {
    return formatVietnamDateTime(date, 'dd/MM/yyyy HH:mm:ss')
  }
  return formatVietnamDateTime(date.toISOString(), 'dd/MM/yyyy HH:mm:ss')
}

/**
 * @deprecated - OLD FUNCTION - DO NOT USE
 * Timezone offset calculation is unreliable
 */
export const getTodayVietnamDate = (): Date => {
  console.warn('[getTodayVietnamDate] ❌ DEPRECATED - timezone calculation is unreliable')
  return new Date()
}

/**
 * @deprecated - OLD FUNCTIONS - DO NOT USE
 */
export const vietnamDateFormatter = {
  parse: parseVietnamTime,
  format: formatVietnamDateTime,
  formatWithSeconds: formatVietnamDateTimeWithSeconds,
  today: getTodayVietnamDate,
}
