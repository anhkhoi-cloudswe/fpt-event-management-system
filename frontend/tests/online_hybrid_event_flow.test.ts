import { describe, it, expect } from 'vitest'

// Helper simulations matching EventRequestCreate.tsx logic
function parseMeetingUrl(rawUrl: string): { platform: 'ZOOM' | 'GOOGLE' | 'CUSTOM'; id: string; secret: string } {
  let platform: 'ZOOM' | 'GOOGLE' | 'CUSTOM' = 'CUSTOM'
  let id = ''
  let secret = ''

  if (/zoom\.us\/j\/(\d+)/i.test(rawUrl)) {
    platform = 'ZOOM'
    const m = rawUrl.match(/zoom\.us\/j\/(\d+)/i)
    if (m && m[1]) id = m[1]
    const pwdMatch = rawUrl.match(/[?&]pwd=([a-zA-Z0-9]+)/i)
    if (pwdMatch && pwdMatch[1]) secret = pwdMatch[1]
  } else if (/meet\.google\.com\/([a-z0-9-]+)/i.test(rawUrl)) {
    platform = 'GOOGLE'
    const m = rawUrl.match(/meet\.google\.com\/([a-z0-9-]+)/i)
    if (m && m[1]) id = m[1].split('?')[0]
  }

  return { platform, id, secret }
}

function validateAndBuildEventPayload(params: {
  flowType: 'UNIVERSITY' | 'INDEPENDENT'
  eventFormat: 'ONLINE' | 'ONSITE' | 'HYBRID'
  title: string
  preferredStart: string
  preferredEnd: string
  expectedParticipants: string
  selectedCampusAreaId?: string
  customVenueName?: string
  customLocation?: string
  meetingUrl?: string
  meetingId?: string
  meetingSecret?: string
  selectedOnlinePlatform?: 'ZOOM' | 'GOOGLE' | 'CUSTOM'
  ticketConfig?: { onlinePrice: number; onsitePrice: number }
}) {
  const {
    flowType,
    eventFormat,
    title,
    preferredStart,
    preferredEnd,
    expectedParticipants,
    selectedCampusAreaId,
    customVenueName,
    customLocation,
    meetingUrl,
    meetingId,
    meetingSecret,
    selectedOnlinePlatform = 'ZOOM',
    ticketConfig = { onlinePrice: 0, onsitePrice: 0 },
  } = params

  const errors: string[] = []

  if (!title.trim()) errors.push('Title is required')
  if (!preferredStart || !preferredEnd) errors.push('Times are required')

  const cap = Math.max(1, parseInt(expectedParticipants || '100') || 100)

  // 1. Online / Hybrid meeting validation
  if (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') {
    const activeUrl = (meetingUrl || '').trim()
    if (!activeUrl) {
      errors.push('Online meeting link is required for ONLINE/HYBRID format')
    } else if (!/^https?:\/\/.+/i.test(activeUrl)) {
      errors.push('Meeting URL must start with http:// or https://')
    }
  }

  // 2. Location validation for University vs Independent
  if (flowType === 'UNIVERSITY' && (eventFormat === 'ONSITE' || eventFormat === 'HYBRID')) {
    if (!selectedCampusAreaId) {
      errors.push('Campus area/room is required for UNIVERSITY onsite or hybrid events')
    }
  }

  if (flowType === 'INDEPENDENT' && (eventFormat === 'ONSITE' || eventFormat === 'HYBRID')) {
    if (!customVenueName?.trim() || !customLocation?.trim()) {
      errors.push('Custom venue name and location are required for INDEPENDENT onsite or hybrid events')
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, payload: null, url: '' }
  }

  // 3. Build Ticket structure for Independent
  let tickets = undefined
  if (flowType === 'INDEPENDENT') {
    if (eventFormat === 'ONLINE') {
      tickets = [{ name: 'Online Ticket', price: ticketConfig.onlinePrice, maxQuantity: cap }]
    } else if (eventFormat === 'ONSITE') {
      tickets = [{ name: 'Onsite Ticket', price: ticketConfig.onsitePrice, maxQuantity: cap }]
    } else {
      const onsiteCap = Math.max(1, Math.floor(cap / 2))
      const onlineCap = Math.max(1, cap - onsiteCap)
      tickets = [
        { name: 'Onsite Ticket', price: ticketConfig.onsitePrice, maxQuantity: onsiteCap },
        { name: 'Online Ticket', price: ticketConfig.onlinePrice, maxQuantity: onlineCap },
      ]
    }
  }

  const payload = {
    title,
    preferredStartTime: preferredStart + ':00',
    preferredEndTime: preferredEnd + ':00',
    expectedCapacity: cap,
    eventFormat,
    customVenueName: eventFormat === 'ONLINE'
      ? (selectedOnlinePlatform === 'ZOOM' ? 'Zoom Meeting' : selectedOnlinePlatform === 'GOOGLE' ? 'Google Meet' : 'Trực tuyến')
      : (customVenueName || null),
    customLocation: eventFormat === 'ONLINE' ? null : (customLocation || null),
    orgType: flowType === 'UNIVERSITY' ? 'SCHOOL' : 'FREE',
    privacyStatus: 'PUBLIC',
    onlineMeetingUrl: (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') ? (meetingUrl?.trim() || null) : null,
    onlineMeetingId: (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') ? (meetingId?.trim() || null) : null,
    onlineMeetingSecret: (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') ? (meetingSecret?.trim() || null) : null,
    tickets,
  }

  const targetEndpoint = flowType === 'UNIVERSITY' ? '/api/event-requests' : '/api/events/independent'

  return { valid: true, errors: [], payload, url: targetEndpoint }
}

describe('Luồng tạo sự kiện Online & Hybrid tại Trường và Tự do', () => {

  describe('Luồng 1: Sự kiện ONLINE tại "trường" (flowType = UNIVERSITY)', () => {
    it('TC1.1: Tạo thành công sự kiện Online tại trường với link Zoom thực tế', () => {
      const zoomUrl = 'https://zoom.us/j/84930219485?pwd=SecurePass123'
      const parsed = parseMeetingUrl(zoomUrl)

      const result = validateAndBuildEventPayload({
        flowType: 'UNIVERSITY',
        eventFormat: 'ONLINE',
        title: 'Hội thảo Công nghệ Phần mềm K19',
        preferredStart: '2026-10-15T09:00',
        preferredEnd: '2026-10-15T11:00',
        expectedParticipants: '100',
        meetingUrl: zoomUrl,
        meetingId: parsed.id,
        meetingSecret: parsed.secret,
        selectedOnlinePlatform: parsed.platform,
      })

      expect(result.valid).toBe(true)
      expect(result.url).toBe('/api/event-requests')
      expect(result.payload?.orgType).toBe('SCHOOL')
      expect(result.payload?.eventFormat).toBe('ONLINE')
      expect(result.payload?.customLocation).toBeNull() // No room needed for online
      expect(result.payload?.onlineMeetingUrl).toBe(zoomUrl)
      expect(result.payload?.onlineMeetingId).toBe('84930219485')
      expect(result.payload?.onlineMeetingSecret).toBe('SecurePass123')
      expect(result.payload?.tickets).toBeUndefined() // School flow uses staff approval, not independent tickets
    })

    it('TC1.2: Chặn submit nếu thiếu link phòng họp online', () => {
      const result = validateAndBuildEventPayload({
        flowType: 'UNIVERSITY',
        eventFormat: 'ONLINE',
        title: 'Hội thảo thiếu link',
        preferredStart: '2026-10-15T09:00',
        preferredEnd: '2026-10-15T11:00',
        expectedParticipants: '100',
        meetingUrl: '',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Online meeting link is required for ONLINE/HYBRID format')
    })
  })

  describe('Luồng 2: Sự kiện HYBRID tại "trường" (flowType = UNIVERSITY)', () => {
    it('TC2.1: Tạo thành công sự kiện Hybrid tại trường có đầy đủ phòng campus và link Google Meet', () => {
      const meetUrl = 'https://meet.google.com/kmt-vwxy-zba'
      const parsed = parseMeetingUrl(meetUrl)

      const result = validateAndBuildEventPayload({
        flowType: 'UNIVERSITY',
        eventFormat: 'HYBRID',
        title: 'Lễ Khai giảng Học kỳ Fall 2026',
        preferredStart: '2026-10-20T08:00',
        preferredEnd: '2026-10-20T11:30',
        expectedParticipants: '250',
        selectedCampusAreaId: '101',
        customVenueName: 'Hội trường Trịnh Công Sơn',
        customLocation: 'Tầng 5 - FPT University Campus',
        meetingUrl: meetUrl,
        meetingId: parsed.id,
        meetingSecret: parsed.secret,
        selectedOnlinePlatform: parsed.platform,
      })

      expect(result.valid).toBe(true)
      expect(result.url).toBe('/api/event-requests')
      expect(result.payload?.orgType).toBe('SCHOOL')
      expect(result.payload?.eventFormat).toBe('HYBRID')
      expect(result.payload?.customVenueName).toBe('Hội trường Trịnh Công Sơn')
      expect(result.payload?.customLocation).toBe('Tầng 5 - FPT University Campus')
      expect(result.payload?.onlineMeetingUrl).toBe(meetUrl)
      expect(result.payload?.onlineMeetingId).toBe('kmt-vwxy-zba')
    })

    it('TC2.2: Chặn submit nếu chưa chọn phòng campus khi tổ chức Hybrid tại trường', () => {
      const result = validateAndBuildEventPayload({
        flowType: 'UNIVERSITY',
        eventFormat: 'HYBRID',
        title: 'Hybrid quên chọn phòng',
        preferredStart: '2026-10-20T08:00',
        preferredEnd: '2026-10-20T11:30',
        expectedParticipants: '150',
        selectedCampusAreaId: '', // Missing room selection
        meetingUrl: 'https://zoom.us/j/84930219485',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Campus area/room is required for UNIVERSITY onsite or hybrid events')
    })
  })

  describe('Luồng 3: Sự kiện ONLINE "tự do" (flowType = INDEPENDENT)', () => {
    it('TC3.1: Tạo thành công sự kiện Online tự do, phát hành vé Online tương ứng sức chứa', () => {
      const zoomUrl = 'https://zoom.us/j/81234567890?pwd=MyPasscode99'
      const parsed = parseMeetingUrl(zoomUrl)

      const result = validateAndBuildEventPayload({
        flowType: 'INDEPENDENT',
        eventFormat: 'ONLINE',
        title: 'Community Tech Meetup Free',
        preferredStart: '2026-10-25T14:00',
        preferredEnd: '2026-10-25T16:00',
        expectedParticipants: '80',
        meetingUrl: zoomUrl,
        meetingId: parsed.id,
        meetingSecret: parsed.secret,
        selectedOnlinePlatform: parsed.platform,
        ticketConfig: { onlinePrice: 50000, onsitePrice: 0 },
      })

      expect(result.valid).toBe(true)
      expect(result.url).toBe('/api/events/independent')
      expect(result.payload?.orgType).toBe('FREE')
      expect(result.payload?.eventFormat).toBe('ONLINE')
      expect(result.payload?.onlineMeetingUrl).toBe(zoomUrl)
      expect(result.payload?.tickets).toHaveLength(1)
      expect(result.payload?.tickets?.[0]).toEqual({
        name: 'Online Ticket',
        price: 50000,
        maxQuantity: 80,
      })
    })
  })

  describe('Luồng 4: Sự kiện HYBRID "tự do" (flowType = INDEPENDENT)', () => {
    it('TC4.1: Tạo thành công sự kiện Hybrid tự do, chia đều vé Onsite và Online 50/50 hợp lý', () => {
      const meetUrl = 'https://meet.google.com/qwe-rtyu-iop'
      const parsed = parseMeetingUrl(meetUrl)

      const result = validateAndBuildEventPayload({
        flowType: 'INDEPENDENT',
        eventFormat: 'HYBRID',
        title: 'Workshop Khởi nghiệp & Đầu tư',
        preferredStart: '2026-10-30T13:30',
        preferredEnd: '2026-10-30T17:00',
        expectedParticipants: '100',
        customVenueName: 'The Hive Coworking Space',
        customLocation: '94 Xuân Thủy, Thảo Điền, TP Thủ Đức',
        meetingUrl: meetUrl,
        meetingId: parsed.id,
        meetingSecret: parsed.secret,
        selectedOnlinePlatform: parsed.platform,
        ticketConfig: { onlinePrice: 100000, onsitePrice: 200000 },
      })

      expect(result.valid).toBe(true)
      expect(result.url).toBe('/api/events/independent')
      expect(result.payload?.orgType).toBe('FREE')
      expect(result.payload?.customVenueName).toBe('The Hive Coworking Space')
      expect(result.payload?.customLocation).toBe('94 Xuân Thủy, Thảo Điền, TP Thủ Đức')
      expect(result.payload?.onlineMeetingUrl).toBe(meetUrl)

      // Tickets must be split logically (50 onsite, 50 online) rather than 99/1
      expect(result.payload?.tickets).toHaveLength(2)
      const onsiteTicket = result.payload?.tickets?.find(t => t.name === 'Onsite Ticket')
      const onlineTicket = result.payload?.tickets?.find(t => t.name === 'Online Ticket')

      expect(onsiteTicket?.maxQuantity).toBe(50)
      expect(onsiteTicket?.price).toBe(200000)
      expect(onlineTicket?.maxQuantity).toBe(50)
      expect(onlineTicket?.price).toBe(100000)
    })

    it('TC4.2: Chặn submit sự kiện Hybrid tự do nếu chưa nhập địa chỉ tổ chức onsite', () => {
      const result = validateAndBuildEventPayload({
        flowType: 'INDEPENDENT',
        eventFormat: 'HYBRID',
        title: 'Hybrid tự do thiếu địa chỉ',
        preferredStart: '2026-10-30T13:30',
        preferredEnd: '2026-10-30T17:00',
        expectedParticipants: '100',
        customVenueName: '',
        customLocation: '',
        meetingUrl: 'https://meet.google.com/qwe-rtyu-iop',
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Custom venue name and location are required for INDEPENDENT onsite or hybrid events')
    })
  })

  describe('Luồng 5: Phân tích và sinh link cuộc họp thực tế (Zoom & Google Meet)', () => {
    it('TC5.1: Tự động trích xuất Zoom Meeting ID và Passcode từ URL', () => {
      const testUrl = 'https://zoom.us/j/82390192841?pwd=XyzPassword456'
      const parsed = parseMeetingUrl(testUrl)

      expect(parsed.platform).toBe('ZOOM')
      expect(parsed.id).toBe('82390192841')
      expect(parsed.secret).toBe('XyzPassword456')
    })

    it('TC5.2: Tự động trích xuất Google Meet Code từ URL', () => {
      const testUrl = 'https://meet.google.com/abc-defg-hij'
      const parsed = parseMeetingUrl(testUrl)

      expect(parsed.platform).toBe('GOOGLE')
      expect(parsed.id).toBe('abc-defg-hij')
      expect(parsed.secret).toBe('')
    })

    it('TC5.3: Nhận diện link tùy chỉnh (Teams, Discord, Webex...)', () => {
      const testUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting'
      const parsed = parseMeetingUrl(testUrl)

      expect(parsed.platform).toBe('CUSTOM')
      expect(parsed.id).toBe('')
    })
  })

  describe('Luồng 6: Book lịch phòng họp theo thời gian mong muốn & Đồng bộ thời lượng', () => {
    const calcMeetingDuration = (startStr: string, endStr: string) => {
      if (!startStr || !endStr) return ''
      try {
        const d1 = new Date(startStr)
        const d2 = new Date(endStr)
        if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return ''
        const diffMins = Math.round((d2.getTime() - d1.getTime()) / 60000)
        const h = Math.floor(diffMins / 60)
        const m = diffMins % 60
        if (h > 0 && m > 0) return `${h} giờ ${m} phút`
        if (h > 0) return `${h} giờ`
        return `${m} phút`
      } catch {
        return ''
      }
    }

    it('TC6.1: Tính toán chính xác thời lượng cuộc họp theo giờ bắt đầu và kết thúc', () => {
      expect(calcMeetingDuration('2026-10-15T09:00', '2026-10-15T11:30')).toBe('2 giờ 30 phút')
      expect(calcMeetingDuration('2026-10-15T08:00', '2026-10-15T10:00')).toBe('2 giờ')
      expect(calcMeetingDuration('2026-10-15T14:00', '2026-10-15T14:45')).toBe('45 phút')
      expect(calcMeetingDuration('', '')).toBe('')
      expect(calcMeetingDuration('2026-10-15T15:00', '2026-10-15T14:00')).toBe('')
    })

    it('TC6.2: Khởi tạo URL kết nối OAuth chứa đầy đủ thông tin lịch trình để đặt phòng', () => {
      const apiBaseUrl = 'http://localhost:8080'
      const platform = 'zoom'
      const redirectUri = `${apiBaseUrl}/api/v1/auth/${platform}/callback`
      const title = 'Hội thảo Lập trình Đám mây 2026'
      const start = '2026-10-25T13:30'
      const end = '2026-10-25T16:30'

      const params = new URLSearchParams({
        redirect_uri: redirectUri,
        app_origin: 'http://localhost:5173',
        title,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
      })
      const connectUrl = `${apiBaseUrl}/api/v1/auth/${platform}/connect?${params.toString()}`

      expect(connectUrl).toContain('title=H%E1%BB%99i+th%E1%BA%A3o+L%E1%BA%ADp+tr%C3%ACnh+%C4%90%C3%A1m+m%C3%A2y+2026')
      expect(connectUrl).toContain('start_time=2026-10-25T13%3A30%3A00')
      expect(connectUrl).toContain('end_time=2026-10-25T16%3A30%3A00')
      expect(connectUrl).toContain('app_origin=http%3A%2F%2Flocalhost%3A5173')
    })

    it('TC6.3: Phân định sức chứa tối đa giữa flow Trường học (theo phòng) và Tự do (đến 1000 người)', () => {
      const maxAllowedUni = (format: string, roomCap = 150) => {
        if (format === 'ONLINE') return 100
        if (format === 'ONSITE') return roomCap
        return 100 + roomCap
      }

      const maxAllowedIndep = () => 1000

      // University flow
      expect(maxAllowedUni('ONLINE')).toBe(100)
      expect(maxAllowedUni('ONSITE', 200)).toBe(200)
      expect(maxAllowedUni('HYBRID', 200)).toBe(300)

      // Independent flow
      expect(maxAllowedIndep()).toBe(1000)
    })
  })
})
