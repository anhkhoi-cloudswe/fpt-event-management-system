// src/types/event.ts

// Map đúng với EventListDto ở BE
export interface EventListItem {
  eventId: number
  title: string
  description: string
  startTime: string // ISO datetime string
  endTime: string
  maxSeats: number
  status: string // OPEN / CLOSED / ...
  bannerUrl?: string | null
  location?: string // Optional location field (for backward compatibility)
  areaId?: number
  areaName?: string
  floor?: string
  venueName?: string
  venueLocation?: string
}

// Chi tiết một sự kiện
export interface EventDetail extends EventListItem {
  venueName?: string
  location?: string
  speakerName?: string
  speakerBio?: string
  speakerAvatarUrl?: string
  currentParticipants?: number
  eventType?: string

  // 👇 thêm các field khu vực
  areaId?: number
  areaName?: string
  floor?: string
  areaCapacity?: number

  tickets?: {
    categoryTicketId: number
    eventId?: number
    name: string
    description?: string | null
    price: number
    maxQuantity: number
    remaining?: number // ✅ FIX: số vé còn lại từ backend (maxQuantity - sold)
    status: string
  }[]

  seats?: {
    seatId: number
    seatCode: string
    rowNo?: string | null
    colNo?: string | null
    status: string
    seatType?: string | null
    categoryTicketId?: number | null
    categoryName?: string | null
    areaId: number
  }[]

  // Lý do từ chối (khi status === 'REJECTED')
  rejectReason?: string | null
}
