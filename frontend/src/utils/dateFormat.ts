/**
 * dateFormat.ts - Xử lý timezone Vietnam (UTC+7)
 * 
 * ⚠️ CRITICAL: Backend đã cấu hình database với loc=Asia/Ho_Chi_Minh
 * => Backend luôn trả thời gian theo UTC+7
 * 
 * VẤN ĐỀ: JavaScript's new Date() sẽ interpret string dựa trên timezone của browser
 * => Nếu browser ở UTC+0, sẽ cộng thêm 7 tiếng ❌
 * 
 * GIẢI PHÁP: Xử lý string thời gian từ backend như là Vietnam time (UTC+7)
 */

import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

/**
 * parseVietnamTime - Parse chuỗi thời gian từ backend như Vietnam time
 * 
 * @param dateStr - Chuỗi thời gian từ backend (dạng: "2025-02-10 09:00:00" hoặc ISO)
 * @returns Date object với giá trị chính xác theo Vietnam timezone
 * 
 * LOGIC:
 * 1. Nếu đã là ISO format với timezone -> parse trực tiếp
 * 2. Nếu là string không có timezone info -> coi như Vietnam time (UTC+7)
 *    Tính toán offset cục bộ để đưa về UTC rồi parse
 */
export const parseVietnamTime = (dateStr: string): Date => {
  try {
    if (!dateStr) {
      console.warn('[parseVietnamTime] Empty date string')
      return new Date()
    }

    // Nếu đã là ISO format với Z (UTC) -> parse bình thường
    if (dateStr.includes('Z') || dateStr.includes('+')) {
      console.log(`[parseVietnamTime] ISO format detected: ${dateStr}`)
      return new Date(dateStr)
    }

    // Xử lý format: "2025-02-10 09:00:00" hoặc "2025-02-10T09:00:00"
    // Coi đây là Vietnam time (UTC+7)
    const normalizedStr = dateStr.replace(' ', 'T')
    const d = new Date(normalizedStr)

    if (isNaN(d.getTime())) {
      console.error(`[parseVietnamTime] Invalid date: ${dateStr}`)
      return new Date()
    }

    // ⚠️ CRITICAL FIX:
    // Browser interpret "2025-02-10T09:00:00" theo local timezone
    // Nếu browser ở UTC+0, JavaScript sẽ tưởng đây là 09:00 UTC => cộng 7h => 16:00 UTC = 23:00 VN ❌
    // 
    // Giải pháp: 
    // - Tính offset giữa browser timezone và Vietnam timezone
    // - Hiệu chỉnh lại date object để nó hiển thị đúng

    const vietnamOffset = 7 * 60 // Vietnam: UTC+7 = +420 mins
    const browserOffset = -d.getTimezoneOffset() // Browser's offset in minutes
    const diffInMinutes = vietnamOffset - browserOffset

    // Tạo date mới bằng cách cộng thêm offset
    const correctedDate = new Date(d.getTime() + diffInMinutes * 60 * 1000)

    console.log(`[parseVietnamTime] Parsed: "${dateStr}"`)
    console.log(`                  Browser offset: ${browserOffset} mins, Vietnam offset: ${vietnamOffset} mins`)
    console.log(`                  Corrected date: ${correctedDate.toISOString()}`)

    return correctedDate
  } catch (error) {
    console.error(`[parseVietnamTime] Error parsing "${dateStr}":`, error)
    return new Date()
  }
}

/**
 * formatVietnamDateTime - Format Date object sang string Vietnam time
 * 
 * @param date - Date object
 * @param formatPattern - date-fns format pattern (default: 'dd/MM/yyyy HH:mm')
 * @returns Formatted string
 */
export const formatVietnamDateTime = (
  date: Date | string,
  formatPattern: string = 'dd/MM/yyyy HH:mm'
): string => {
  try {
    const dateObj = typeof date === 'string' ? parseVietnamTime(date) : date
    return format(dateObj, formatPattern, { locale: vi })
  } catch (error) {
    console.error('[formatVietnamDateTime] Error formatting:', error)
    return 'Invalid Date'
  }
}

/**
 * formatVietnamDateTimeWithSeconds - Format với giây
 * @param date - Date object hoặc string
 * @returns String format: dd/MM/yyyy HH:mm:ss
 */
export const formatVietnamDateTimeWithSeconds = (date: Date | string): string => {
  return formatVietnamDateTime(date, 'dd/MM/yyyy HH:mm:ss')
}

/**
 * getTodayVietnamDate - Lấy ngày hôm nay theo Vietnam time
 * @returns Date object with today's date in Vietnam timezone
 */
export const getTodayVietnamDate = (): Date => {
  const now = new Date()
  const vietnamOffset = 7 * 60
  const browserOffset = -now.getTimezoneOffset()
  const diffInMinutes = vietnamOffset - browserOffset
  return new Date(now.getTime() + diffInMinutes * 60 * 1000)
}

// Export một object tiện dụng
export const vietnamDateFormatter = {
  parse: parseVietnamTime,
  format: formatVietnamDateTime,
  formatWithSeconds: formatVietnamDateTimeWithSeconds,
  today: getTodayVietnamDate,
}
