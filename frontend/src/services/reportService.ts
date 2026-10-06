import { api } from '../config/api'

export interface EventFinancialOverview {
  eventId: number
  title: string
  organizerId?: number
  organizerName?: string
  totalGrossRevenue: number
  totalGrossFormatted: string
  totalPlatformFee: number
  totalPlatformFeeFormatted: string
  totalNetProfit: number
  totalNetFormatted: string
  totalTicketsSold: number
  totalTicketsRefunded: number
  currency: string
  isSettled: boolean
  createdAt: string
}

export interface EventCheckInItem {
  ticketId: number
  ticketCode: string
  categoryTicketId: number
  categoryName: string
  priceVnd?: number
  priceFormatted?: string
  userId: number
  attendeeName: string
  attendeeEmail: string
  seatCode?: string
  status: string
  checkedInAt?: string
  checkedOutAt?: string
  createdAt: string
}

export interface EventCategorySeatStatus {
  categoryTicketId: number
  categoryName: string
  price: number
  priceFormatted: string
  totalCapacity: number
  soldSeats: number
  remainingSeats: number
  checkedInSeats: number
  checkedOutSeats: number
  fillRatePercent: number
}

export interface EventRealtimeSeatStatusResponse {
  eventId: number
  title: string
  totalCapacity: number
  totalSold: number
  totalRemaining: number
  totalCheckedIn: number
  totalCheckedOut: number
  categories: EventCategorySeatStatus[]
}

export interface HourlyCheckInPoint {
  hour: number
  count: number
}

export interface CategorySalesBreakdown {
  categoryTicketId: number
  categoryName: string
  price: number
  priceFormatted: string
  totalCapacity: number
  soldSeats: number
  remainingSeats: number
  checkedInSeats: number
  grossRevenue: number
  grossFormatted: string
  platformFee: number
  netProfit: number
  netFormatted: string
  fillRatePercent: number
}

export interface DailySalesPoint {
  date: string
  ticketsSold: number
  grossRevenue: number
  platformFee: number
  netProfit: number
  grossFormatted: string
  netFormatted: string
}

export interface EventAdvancedAnalyticsResponse {
  eventId: number
  title: string
  totalGrossRevenue: number
  totalGrossFormatted: string
  totalPlatformFee: number
  totalPlatformFeeFormatted: string
  totalNetProfit: number
  totalNetFormatted: string
  totalTicketsSold: number
  checkedInTickets: number
  checkInRatePercent: number
  averageOrderValue: number
  totalCapacity: number
  fillRatePercent: number
  timeline: DailySalesPoint[]
  categoryBreakdown: CategorySalesBreakdown[]
  hourlyCheckIns: HourlyCheckInPoint[]
  hasAdvancedReports: boolean
}

export const reportService = {
  // GET /api/v1/organizer/events/{id}/financial-overview
  async getFinancialOverview(eventId: number): Promise<EventFinancialOverview> {
    const res = await api.get(`/v1/organizer/events/${eventId}/financial-overview`)
    return res.data?.data || res.data
  },

  // GET /api/v1/organizer/events/{id}/check-in-list
  async getCheckInList(eventId: number): Promise<EventCheckInItem[]> {
    const res = await api.get(`/v1/organizer/events/${eventId}/check-in-list`)
    const data = res.data?.data || res.data
    return Array.isArray(data) ? data : []
  },

  // GET /api/v1/organizer/events/{id}/seat-status
  async getSeatStatus(eventId: number): Promise<EventRealtimeSeatStatusResponse> {
    const res = await api.get(`/v1/organizer/events/${eventId}/seat-status`)
    return res.data?.data || res.data
  },

  // GET /api/v1/organizer/events/{id}/advanced-analytics
  async getAdvancedAnalytics(eventId: number): Promise<EventAdvancedAnalyticsResponse> {
    const res = await api.get(`/v1/organizer/events/${eventId}/advanced-analytics`)
    return res.data?.data || res.data
  },

  // GET /api/v1/organizer/events/{id}/export-csv (download file blob qua API)
  async exportEventCSV(eventId: number, title?: string): Promise<void> {
    const res = await api.get(`/v1/organizer/events/${eventId}/export-csv`, {
      responseType: 'blob',
    })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const safeTitle = (title || `event_${eventId}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    link.setAttribute('download', `${safeTitle}_analytics.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  // GET /api/events (Lấy danh sách sự kiện - Admin thấy tất cả, Organizer chỉ lấy sự kiện do chính họ tạo)
  async getEventOptions(userId?: number, role?: string): Promise<{ id: number; title: string; startTime?: string; status?: string; organizerId?: number; organizerName?: string; organizerEmail?: string }[]> {
    const res = await api.get('/events?page=1&limit=200')
    const raw = res.data?.data || res.data
    const list = Array.isArray(raw) ? raw : []
    
    // Nếu là ORGANIZER / SCHOOL_ORGANIZER thì chỉ lọc ra các sự kiện của chính user đó (createdBy === userId)
    const filtered = (role === 'ORGANIZER' || role === 'SCHOOL_ORGANIZER') && userId
      ? list.filter((ev: any) => {
          const owner = ev.createdBy || ev.userId || ev.organizerId
          return owner === userId || !owner // nếu payload backend trả kèm owner
        })
      : list

    return filtered.map((ev: any) => ({
      id: ev.eventId || ev.id,
      title: ev.title,
      startTime: ev.startTime,
      status: ev.status,
      organizerId: ev.createdBy || ev.userId || ev.organizerId || (ev.organizer?.userId) || 0,
      organizerName: ev.organizerName || ev.organizer?.fullName || ev.createdByName || (ev.createdBy ? `Organizer #${ev.createdBy}` : 'Hệ thống FEMS'),
      organizerEmail: ev.organizerEmail || ev.organizer?.email || '',
    }))
  },
}
