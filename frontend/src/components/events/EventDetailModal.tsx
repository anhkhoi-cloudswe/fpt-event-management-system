// Component Modal hiển thị chi tiết sự kiện dưới dạng right-side flyout (độ hoàn thiện cao)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Calendar, Users, Clock, MapPin, X, Copy, ExternalLink } from 'lucide-react'
import { formatWallClockDateTimeSimple, compareTimeStringsForEventStatus } from '../../utils/dateFormat'
import type { EventDetail } from '../../types/event'
import { SeatGrid, type Seat } from '../common/SeatGrid'
import { createPortal } from 'react-dom'

// ===================== TYPE: Ticket =====================
type Ticket = {
  categoryTicketId: number
  name: string
  description?: string | null
  price: number
  maxQuantity: number
  remaining?: number
  status: string
}

type ApiSeat = {
  seatId?: number | string
  seat_id?: number | string
  seatCode?: string
  seat_code?: string
  rowNo?: string
  row_no?: string
  seatRow?: string
  seat_row?: string
  colNo?: string | number
  col_no?: string | number
  seatColumn?: number | string
  seat_column?: number | string
  status?: string
  seatType?: string
  seat_type?: string
  categoryTicketId?: number | string | null
  category_ticket_id?: number | string | null
  categoryName?: string | null
  category_name?: string | null
  areaId?: number | string
  area_id?: number | string
}

interface EventDetailModalProps {
  isOpen: boolean
  onClose: () => void
  event: EventDetail | null
  loading: boolean
  error: string | null
  userRole?: string
  onEdit?: () => void
}

// Format date in English & Vietnamese
const formatLumaDate = (rfc3339Str: string | undefined, lang: 'vi' | 'en' = 'vi'): string => {
  if (!rfc3339Str) return ''
  try {
    const d = new Date(rfc3339Str)
    if (lang === 'en') {
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    } else {
      const weekday = d.toLocaleDateString('vi-VN', { weekday: 'long' })
      const day = d.getDate()
      const month = d.getMonth() + 1
      const year = d.getFullYear()
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
      return `${capitalizedWeekday}, ngày ${day} tháng ${month}, ${year}`
    }
  } catch {
    return rfc3339Str
  }
}

const formatLumaTimeRange = (startIso: string | undefined, endIso: string | undefined, lang: 'vi' | 'en' = 'vi'): string => {
  if (!startIso || !endIso) return ''
  try {
    const s = new Date(startIso)
    const e = new Date(endIso)
    if (lang === 'en') {
      const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      return `${formatTime(s)} - ${formatTime(e)}`
    } else {
      const formatTime = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
      return `${formatTime(s)} - ${formatTime(e)}`
    }
  } catch {
    return ''
  }
}

export function EventDetailModal({
  isOpen,
  onClose,
  event,
  loading,
  error,
  userRole,
  onEdit,
}: EventDetailModalProps) {
  const navigate = useNavigate()
  const { user, currentLanguage } = useAuth()
  const text = {
    loading: currentLanguage === 'en' ? 'Loading event details...' : 'Dang tai chi tiet...',
    error: currentLanguage === 'en' ? 'Error' : 'Loi',
    copied: currentLanguage === 'en' ? 'Copied' : 'Da copy',
    copyLink: currentLanguage === 'en' ? 'Copy Link' : 'Copy Link',
    eventPage: currentLanguage === 'en' ? 'Event Page' : 'Trang su kien',
    fullSize: currentLanguage === 'en' ? 'View full size' : 'Xem kich thuoc day du',
    area: currentLanguage === 'en' ? 'Area' : 'Khu vuc',
    floor: currentLanguage === 'en' ? 'Floor' : 'Tang',
    capacity: currentLanguage === 'en' ? 'Capacity' : 'Suc chua',
    seats: currentLanguage === 'en' ? 'seats' : 'cho',
    registered: currentLanguage === 'en' ? 'Registered' : 'Da dang ky',
    people: currentLanguage === 'en' ? 'people' : 'nguoi',
    description: currentLanguage === 'en' ? 'Event Description' : 'Mo ta su kien',
    speaker: currentLanguage === 'en' ? 'Speaker' : 'Dien gia',
    ticketsSeats: currentLanguage === 'en' ? 'Tickets & Seats' : 'Ve & Dat Ghe',
    closedNotice: currentLanguage === 'en'
      ? 'This event is closed. Ticket booking is not available right now.'
      : 'Su kien nay da dong. Ban khong the thuc hien dat ve vao luc nay.',
    remaining: currentLanguage === 'en' ? 'Remaining' : 'Con lai',
    seatMap: currentLanguage === 'en' ? 'Seat Map' : 'So do chon ghe',
    selectedSeats: currentLanguage === 'en' ? 'Selected seats' : 'Ghe da chon',
    totalAmount: currentLanguage === 'en' ? 'Total amount' : 'Tong so tien',
    updateInfo: currentLanguage === 'en' ? 'Update info' : 'Cap nhat thong tin',
    close: currentLanguage === 'en' ? 'Close' : 'Dong',
    register: currentLanguage === 'en' ? 'Register for Event' : 'Dang ky su kien',
    chooseSeats: currentLanguage === 'en' ? 'Choose seats to register' : 'Chon ghe de dang ky',
    ongoing: currentLanguage === 'en' ? 'Event is ongoing' : 'Su kien dang dien ra',
    seatPending: (seatCode: string) => currentLanguage === 'en'
      ? `Seat ${seatCode} is being held for payment. Please choose another seat.`
      : `Ghe ${seatCode} dang duoc giu cho trong qua trinh thanh toan. Vui long chon ghe khac.`,
    noTicket: currentLanguage === 'en' ? 'No matching ticket type found' : 'Khong tim thay loai ve phu hop',
    detailMap: currentLanguage === 'en' ? 'event detail map' : 'so do chi tiet su kien',
  }
  const [copied, setCopied] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [loadingSeats, setLoadingSeats] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)

  // Body scroll lock effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const isManager = !!(
    userRole &&
    /(?:ORGAN|ORGEN|STAFF|ADMIN)/i.test(String(userRole).trim())
  )

  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return undefined
  }

  const normalizeSeat = (rawSeat: ApiSeat): Seat | null => {
    const seatId = toNumber(rawSeat.seatId ?? rawSeat.seat_id)
    const seatCode = (rawSeat.seatCode ?? rawSeat.seat_code ?? '').toString()
    const areaId = toNumber(rawSeat.areaId ?? rawSeat.area_id ?? event?.areaId)

    if (!seatId || !seatCode || !areaId) {
      return null
    }

    const categoryTicketId = toNumber(
      rawSeat.categoryTicketId ?? rawSeat.category_ticket_id,
    )

    const rawStatus = String(rawSeat.status ?? '').trim().toUpperCase()
    let mappedStatus = 'ACTIVE'
    if (rawStatus === 'BOOKED' || rawStatus === 'CHECKED_IN' || rawStatus === 'OCCUPIED') {
      mappedStatus = 'BOOKED'
    } else if (rawStatus === 'PENDING' || rawStatus === 'HOLD' || rawStatus === 'RESERVED') {
      mappedStatus = 'PENDING'
    } else if (rawStatus === 'ACTIVE' || rawStatus === 'AVAILABLE' || rawStatus === '') {
      mappedStatus = 'ACTIVE'
    }

    const normalized: Seat = {
      seatId,
      seatCode,
      rowNo: (rawSeat.rowNo ?? rawSeat.row_no) as string | undefined,
      seatRow: (rawSeat.seatRow ?? rawSeat.seat_row) as string | undefined,
      colNo: rawSeat.colNo != null ? String(rawSeat.colNo) : rawSeat.col_no != null ? String(rawSeat.col_no) : undefined,
      seatColumn: toNumber(rawSeat.seatColumn ?? rawSeat.seat_column),
      status: mappedStatus,
      seatType: (rawSeat.seatType ?? rawSeat.seat_type) as string | undefined,
      categoryTicketId,
      categoryName: (rawSeat.categoryName ?? rawSeat.category_name ?? undefined) as string | undefined,
      areaId,
    }

    return normalized
  }

  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  useEffect(() => {
    if (!event || loading) return

    setLoadingSeats(true)
    try {
      const rawSeats = (event.seats ?? []) as ApiSeat[]
      const normalizedSeats = rawSeats
        .map((seat) => normalizeSeat(seat))
        .filter((seat): seat is Seat => seat !== null)

      setAllSeats(normalizedSeats)
    } catch (err: any) {
      console.error('Error mapping event seats:', err)
      setAllSeats([])
    } finally {
      setLoadingSeats(false)
    }
  }, [event, loading])

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket)
  }

  const handleSeatSelect = (seat: Seat) => {
    if (!event) return
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${event.eventId}/page`)}`)
      return
    }
    if (!isSeatAvailableForSelect(seat)) {
      if (seat.status === 'PENDING') {
        alert(text.seatPending(seat.seatCode))
      }
      return
    }

    setSelectedSeats((prev) => {
      const exists = prev.some((s) => s.seatId === seat.seatId)
      if (exists) {
        return prev.filter((s) => s.seatId !== seat.seatId)
      }
      if (prev.length >= 4) {
        return prev
      }
      return [...prev, seat]
    })
  }

  const confirmSeats = () => {
    if (!event || selectedSeats.length === 0) return

    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${event.eventId}/page`)}`)
      return
    }

    let totalAmount = 0
    const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))

    let vipCount = 0
    let standardCount = 0
    const breakdownMap = new Map<number, { ticket: typeof vipTicket; count: number }>()

    selectedSeats.forEach((seat) => {
      const matchedTicket = event.tickets?.find((t) => t.categoryTicketId === seat.categoryTicketId)
      if (matchedTicket) {
        totalAmount += matchedTicket.price
        const existing = breakdownMap.get(matchedTicket.categoryTicketId)
        if (existing) existing.count++
        else breakdownMap.set(matchedTicket.categoryTicketId, { ticket: matchedTicket, count: 1 })
      } else if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
        vipCount++
      } else if (standardTicket) {
        totalAmount += standardTicket.price
        standardCount++
      }
    })

    const firstSeatTicket = event.tickets?.find(
      (t) => t.categoryTicketId === selectedSeats[0]?.categoryTicketId
    )
    const ticketToUse =
      selectedTicket ||
      firstSeatTicket ||
      (selectedSeats[0]?.seatType === 'VIP' ? vipTicket : standardTicket)

    if (!ticketToUse) {
      alert(text.noTicket)
      return
    }

    const seatIds = selectedSeats.map((s) => s.seatId)
    const seatCodes = selectedSeats.map((s) => s.seatCode)

    const ticketBreakdown: Array<{ name: string; count: number; price: number }> = []
    if (breakdownMap.size > 0) {
      breakdownMap.forEach(({ ticket: t, count }) => {
        if (t) ticketBreakdown.push({ name: t.name, count, price: t.price })
      })
    }
    if (ticketBreakdown.length === 0) {
      if (vipCount > 0 && vipTicket) {
        ticketBreakdown.push({ name: vipTicket.name, count: vipCount, price: vipTicket.price })
      }
      if (standardCount > 0 && standardTicket) {
        ticketBreakdown.push({ name: standardTicket.name, count: standardCount, price: standardTicket.price })
      }
    }

    navigate('/dashboard/payment', {
      state: {
        eventId: event.eventId,
        categoryTicketId: ticketToUse.categoryTicketId,
        seatIds,
        seatCodes,
        eventTitle: event.title,
        ticketName: ticketToUse.name,
        ticketBreakdown,
        pricePerTicket: ticketToUse.price,
        quantity: selectedSeats.length,
        totalAmount,
      },
    })
  }

  const handleClose = () => {
    setSelectedTicket(null)
    setSelectedSeats([])
    setAllSeats([])
    onClose()
  }

  const handleCopyLink = () => {
    if (!event) return
    const id = event.eventId || (event as any).id
    navigator.clipboard.writeText(`${window.location.origin}/events/${id}/page`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  const now = new Date().toISOString()
  const { eventOngoing, eventEnded } = event
    ? compareTimeStringsForEventStatus(now, event.startTime, event.endTime)
    : { eventOngoing: false, eventEnded: false }

  const eventClosed = event ? (event.status === 'CLOSED' || (event as any).isClosed === true) : false

  let totalAmount = 0
  if (event && selectedSeats.length > 0) {
    const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))

    selectedSeats.forEach((seat) => {
      const matchedTicket = event.tickets?.find((t) => t.categoryTicketId === seat.categoryTicketId)
      if (matchedTicket) {
        totalAmount += matchedTicket.price
      } else if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
      } else if (standardTicket) {
        totalAmount += standardTicket.price
      }
    })
  }

  const selectedSeatCodesText =
    selectedSeats.length > 0 ? selectedSeats.map((s) => s.seatCode).join(', ') : ''

  const eventId = event?.eventId || (event as any)?.id || 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleClose}
      />

      {/* Flyout panel container */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl flex flex-col h-full z-10 animate-slide-in-right border-l border-gray-200 dark:border-slate-800">
        {/* ===== UTILITY HEADER BAR ===== */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-850 px-4 py-3.5 flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-250 dark:border-slate-700 text-xs font-semibold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95 shadow-sm"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? text.copied : text.copyLink}
            </button>

            <button
              type="button"
              onClick={() => navigate(`/events/${eventId}/page`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-250 dark:border-slate-700 text-xs font-semibold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {text.eventPage}
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===== CONTENT SCROLLABLE ZONE ===== */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && (
            <p className="text-gray-500 text-center py-4">{text.loading}</p>
          )}

          {error && (
            <p className="text-red-500 text-center py-4">{text.error}: {error}</p>
          )}

          {!loading && !error && event && (
            <>
              {/* Event Cover Image Widget */}
              {event.bannerUrl && (
                <div
                  onClick={() => setIsZoomed(true)}
                  className="rounded-xl overflow-hidden shadow-sm aspect-video mb-4 relative group cursor-zoom-in bg-slate-100 dark:bg-slate-800 border dark:border-slate-850"
                >
                  <img
                    src={event.bannerUrl}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    {text.fullSize}
                  </div>
                </div>
              )}

              {/* Title & Meta Row details */}
              <div className="space-y-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4 leading-tight">
                  {event.title}
                </h2>

                <div className="grid grid-cols-1 gap-3">
                  {/* Time Slot metadata row */}
                  <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                    <Calendar className="w-4 h-4 text-orange-500 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-slate-700 dark:text-slate-100 font-medium">
                        {formatLumaDate(event.startTime, currentLanguage)}
                      </p>
                      <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">
                        {formatLumaTimeRange(event.startTime, event.endTime, currentLanguage)}
                      </p>
                    </div>
                  </div>

                  {/* Location metadata row */}
                  {event.venueName && (
                    <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                      <MapPin className="w-4 h-4 text-orange-500 mt-0.5" />
                      <div className="text-xs">
                        <p className="text-slate-700 dark:text-slate-100 font-medium">{event.venueName}</p>
                        {event.areaName && (
                          <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">
                            {text.area}: {event.areaName} {event.floor ? `· ${text.floor} ${event.floor}` : ''}
                          </p>
                        )}
                        {event.location && (
                          <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">{event.location}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Seats Capacity info row */}
                  <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                    <Users className="w-4 h-4 text-orange-500 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-slate-700 dark:text-slate-100 font-medium">
                        {text.capacity}: {event.maxSeats} {text.seats}
                      </p>
                      {event.currentParticipants != null && (
                        <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">
                          {text.registered}: {event.currentParticipants} {text.people}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{text.description}</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>

              {/* Speaker Bio */}
              {event.speakerName && (
                <div className="p-4 rounded-xl border border-gray-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center gap-3">
                    {event.speakerAvatarUrl ? (
                      <img
                        src={event.speakerAvatarUrl}
                        alt={event.speakerName}
                        className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xl">👤</div>
                    )}
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{text.speaker}</p>
                      <h4 className="font-bold text-gray-900 dark:text-white">{event.speakerName}</h4>
                    </div>
                  </div>
                  {event.speakerBio && (
                    <p className="text-xs text-gray-650 dark:text-slate-450 leading-relaxed">
                      {event.speakerBio}
                    </p>
                  )}
                </div>
              )}

              {/* Staff Reject Reason if applicable */}
              {event.status === 'REJECTED' && event.rejectReason && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl space-y-1">
                  <h4 className="text-xs font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                    <span>🚫</span> Lý do từ chối từ Ban quản trị:
                  </h4>
                  <p className="text-xs text-red-750 dark:text-red-400/90 leading-relaxed">
                    {event.rejectReason}
                  </p>
                </div>
              )}

              {/* Reactive Ticket / Seat Grid selection Zone */}
              <div className="border-t border-gray-200 dark:border-slate-800 pt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{text.ticketsSeats}</h3>
                  {event.status === 'CLOSED' || eventClosed ? (
                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/30 text-red-650 dark:text-red-450 text-[10px] font-black uppercase tracking-wider rounded-md">Closed</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-950/30 text-green-650 dark:text-green-450 text-[10px] font-black uppercase tracking-wider rounded-md">Active</span>
                  )}
                </div>

                {eventClosed || eventEnded ? (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-300">
                    {text.closedNotice}
                  </div>
                ) : (
                  <>
                    {/* Ticket options */}
                    {event.tickets && event.tickets.length > 0 && (
                      <div className="space-y-2">
                        {event.tickets.map((ticket) => {
                          const total = ticket.maxQuantity
                          const seatsAvailable = allSeats.filter(
                            (s: Seat) => {
                              const status = String(s.status ?? '').toUpperCase()
                              return s.categoryTicketId === ticket.categoryTicketId && (status === 'ACTIVE' || status === 'AVAILABLE')
                            }
                          ).length
                          const availableCount =
                            ticket.remaining !== undefined
                              ? ticket.remaining
                              : seatsAvailable > 0
                                ? seatsAvailable
                                : total

                          const isSelectedTicket =
                            selectedTicket?.categoryTicketId === ticket.categoryTicketId

                          return (
                            <div
                              key={ticket.categoryTicketId}
                              onClick={() =>
                                handleSelectTicket({
                                  categoryTicketId: ticket.categoryTicketId,
                                  name: ticket.name,
                                  price: ticket.price,
                                  maxQuantity: ticket.maxQuantity,
                                  status: ticket.status,
                                })
                              }
                              className={`flex items-center justify-between gap-4 py-2.5 px-3.5 rounded-xl border cursor-pointer transition-all ${isSelectedTicket
                                ? 'border-orange-500 bg-orange-500/5 dark:bg-orange-500/10'
                                : 'border-gray-150 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/60'
                                }`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs text-gray-900 dark:text-white">{ticket.name}</p>
                                {ticket.description && (
                                  <p className="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                    {ticket.description}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                  {text.remaining}: <span className="font-bold">{availableCount}/{total}</span>
                                </p>
                              </div>
                              <p className="font-black text-sm text-orange-500 whitespace-nowrap">
                                {ticket.price.toLocaleString('vi-VN')} đ
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Seat Grid section */}
                    {event.areaId && (
                      <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">{text.seatMap}</h4>
                        <SeatGrid
                          seats={allSeats}
                          loading={loadingSeats}
                          selectedSeats={selectedSeats}
                          onSeatSelect={(seat) => seat && handleSeatSelect(seat)}
                          maxReached={selectedSeats.length >= 4}
                          disabled={eventEnded || eventClosed || eventOngoing}
                          allowSelect={!isManager && !eventClosed && !eventEnded && !eventOngoing}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* ===== FOOTER ACTIONS ===== */}
        {!loading && !error && event && (
          <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-850 p-4 space-y-3 flex-shrink-0">
            {selectedSeats.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{text.selectedSeats}:</p>
                  <p className="font-bold text-gray-900 dark:text-white mt-0.5">{selectedSeatCodesText}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{text.totalAmount}:</p>
                  <p className="font-black text-sm text-orange-500 mt-0.5">{totalAmount.toLocaleString('vi-VN')} đ</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {/* Update Info for Organizer */}
              {userRole === 'ORGANIZER' && event.status === 'APPROVED' && onEdit && (
                <button
                  onClick={onEdit}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {text.updateInfo}
                </button>
              )}

              {/* Close Panel Button */}
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                {text.close}
              </button>

              {/* Primary Registration Trigger */}
              {!isManager && !eventOngoing && !eventClosed && !eventEnded && (
                <button
                  onClick={confirmSeats}
                  disabled={selectedSeats.length === 0}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all shadow-md active:scale-98 ${
                    selectedSeats.length > 0
                      ? 'bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-orange-950/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {selectedSeats.length > 0 ? text.register : text.chooseSeats}
                </button>
              )}

              {eventOngoing && (
                <div className="flex-1 py-2.5 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-250 dark:border-yellow-900/40 text-yellow-800 dark:text-yellow-350 text-center rounded-xl text-xs font-bold">
                  {text.ongoing}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Zoom Modal */}
      {isZoomed && event?.bannerUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-[9999] flex flex-col items-center justify-center p-4 cursor-zoom-out animate-fade-in"
          onClick={() => setIsZoomed(false)}
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          <div className="max-w-5xl max-h-[90vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={event.bannerUrl} alt={event.title} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
          <p className="text-slate-300 text-sm mt-3 font-semibold text-center pointer-events-none bg-black/40 px-4 py-1.5 rounded-full">
            {event.title} - {text.detailMap}
          </p>
        </div>
      )}
    </div>,
    document.body
  )
}
