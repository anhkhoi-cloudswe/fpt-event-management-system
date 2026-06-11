import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { SeatGrid, type Seat } from '../../components/common/SeatGrid'
import { compareTimeStringsForEventStatus } from '../../utils/dateFormat'
import type { EventDetail } from '../../types/event'

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

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const formatDate = (value: string | undefined, lang: 'vi' | 'en') => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  if (lang === 'en') {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const formatTimeRange = (start: string | undefined, end: string | undefined, lang: 'vi' | 'en') => {
  if (!start || !end) return ''
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return ''

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: lang === 'en',
  }

  return `${startDate.toLocaleTimeString(lang === 'en' ? 'en-US' : 'vi-VN', options)} - ${endDate.toLocaleTimeString(lang === 'en' ? 'en-US' : 'vi-VN', options)}`
}

const normalizeSeat = (rawSeat: ApiSeat, fallbackAreaId?: number): Seat | null => {
  const seatId = toNumber(rawSeat.seatId ?? rawSeat.seat_id)
  const seatCode = (rawSeat.seatCode ?? rawSeat.seat_code ?? '').toString()
  const areaId = toNumber(rawSeat.areaId ?? rawSeat.area_id) ?? fallbackAreaId

  if (!seatId || !seatCode || !areaId) return null

  const rawStatus = String(rawSeat.status ?? '').trim().toUpperCase()
  let status = 'ACTIVE'
  if (['BOOKED', 'CHECKED_IN', 'OCCUPIED'].includes(rawStatus)) status = 'BOOKED'
  if (['PENDING', 'HOLD', 'RESERVED'].includes(rawStatus)) status = 'PENDING'

  return {
    seatId,
    seatCode,
    rowNo: (rawSeat.rowNo ?? rawSeat.row_no) as string | undefined,
    seatRow: (rawSeat.seatRow ?? rawSeat.seat_row) as string | undefined,
    colNo: rawSeat.colNo != null ? String(rawSeat.colNo) : rawSeat.col_no != null ? String(rawSeat.col_no) : undefined,
    seatColumn: toNumber(rawSeat.seatColumn ?? rawSeat.seat_column),
    status,
    seatType: (rawSeat.seatType ?? rawSeat.seat_type) as string | undefined,
    categoryTicketId: toNumber(rawSeat.categoryTicketId ?? rawSeat.category_ticket_id),
    categoryName: (rawSeat.categoryName ?? rawSeat.category_name ?? undefined) as string | undefined,
    areaId,
  }
}

export default function PublicEventPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, currentLanguage } = useAuth()
  const pageLanguage: 'vi' | 'en' = user ? currentLanguage : 'en'
  const t = {
    loading: pageLanguage === 'en' ? 'Loading event page...' : 'Đang tải trang sự kiện...',
    error: pageLanguage === 'en' ? 'Error' : 'Lỗi',
    notFound: pageLanguage === 'en' ? 'Event not found' : 'Không tìm thấy sự kiện',
    back: pageLanguage === 'en' ? 'Back' : 'Quay lại',
    hostedBy: pageLanguage === 'en' ? 'Hosted by' : 'Tổ chức bởi',
    time: pageLanguage === 'en' ? 'Event Time' : 'Thời gian diễn ra',
    location: pageLanguage === 'en' ? 'Location' : 'Địa điểm tổ chức',
    defaultLocation: pageLanguage === 'en' ? 'FPT location' : 'Địa điểm FPT',
    area: pageLanguage === 'en' ? 'Area' : 'Khu vực',
    floor: pageLanguage === 'en' ? 'Floor' : 'Tầng',
    registration: pageLanguage === 'en' ? 'Registration' : 'Đăng ký tham gia',
    closedNotice: pageLanguage === 'en'
      ? 'This event is closed. Ticket booking is not available right now.'
      : 'Sự kiện này đã đóng. Bạn không thể thực hiện đặt vé vào lúc này.',
    chooseTicket: pageLanguage === 'en' ? 'Choose ticket tier' : 'Chọn hạng vé',
    remaining: pageLanguage === 'en' ? 'Remaining' : 'Còn lại',
    tickets: pageLanguage === 'en' ? 'tickets' : 'vé',
    chooseSeat: pageLanguage === 'en' ? 'Choose your seat' : 'Chọn vị trí ngồi của bạn',
    selectedSeats: pageLanguage === 'en' ? 'Selected seats' : 'Ghế chọn',
    totalPayment: pageLanguage === 'en' ? 'Total payment' : 'Tổng thanh toán',
    register: pageLanguage === 'en' ? 'Register for Event' : 'Đăng ký sự kiện',
    chooseSeatsToRegister: pageLanguage === 'en' ? 'Choose seats to register' : 'Chọn ghế để đăng ký',
    about: pageLanguage === 'en' ? 'About Event' : 'Mô tả sự kiện',
    mainSpeaker: pageLanguage === 'en' ? 'Main Speaker' : 'Diễn giả chính',
    noTicket: pageLanguage === 'en' ? 'No matching ticket type found' : 'Không tìm thấy loại vé phù hợp',
    organizerFallback: pageLanguage === 'en' ? 'Event Organizer' : 'Người tổ chức sự kiện',
  }

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)

  useEffect(() => {
    const styleId = 'public-event-page-cinema-override'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        html.public-event-canvas,
        html.public-event-canvas body { background-color: #050505 !important; }
        html.public-event-canvas > body > div,
        html.public-event-canvas [class*="bg-slate-950"],
        html.public-event-canvas [class*="bg-gradient-to-br"],
        html.public-event-canvas main > div { background: transparent !important; }
        html.public-event-canvas main > div { padding: 0 !important; max-width: 100% !important; }
      `
      document.head.appendChild(style)
    }

    document.documentElement.classList.add('public-event-canvas')
    return () => {
      document.documentElement.classList.remove('public-event-canvas')
      document.getElementById(styleId)?.remove()
    }
  }, [])

  useEffect(() => {
    if (!id) return

    const fetchEvent = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/events/detail?id=${id}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error('Failed to fetch event details')
        setEvent(await res.json())
      } catch (err: any) {
        setError(err.message || (pageLanguage === 'en' ? 'Unable to load event details' : 'Không thể tải thông tin sự kiện'))
      } finally {
        setLoading(false)
      }
    }

    void fetchEvent()
  }, [id, pageLanguage])

  useEffect(() => {
    if (!event || loading) return
    const seats = ((event.seats ?? []) as ApiSeat[])
      .map((seat) => normalizeSeat(seat, event.areaId))
      .filter((seat): seat is Seat => Boolean(seat))
    setAllSeats(seats)
  }, [event, loading])

  const eventBannerImg = event?.bannerUrl || (event as (EventDetail & { bannerImg?: string | null }) | null)?.bannerImg || ''
  const organizerId = event?.organizerId ?? (event as (EventDetail & { organizer_id?: number }) | null)?.organizer_id
  const hostName = event?.organizerName || (organizerId ? `${t.organizerFallback} #${organizerId}` : t.organizerFallback)
  const hostInitial = hostName.trim().charAt(0).toUpperCase() || 'F'
  const locationTitle = event?.venueName || event?.location || t.defaultLocation
  const locationDetail = [
    event?.areaName ? `${t.area}: ${event.areaName}` : '',
    event?.floor ? `${t.floor} ${event.floor}` : '',
  ].filter(Boolean).join(' · ')

  const applyStoredDashboardTheme = () => {
    const storedTheme = user?.id
      ? localStorage.getItem('theme_user_' + user.id) || localStorage.getItem('theme')
      : localStorage.getItem('theme')
    const themeToApply = user?.theme === 'dark' || storedTheme === 'dark' ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', themeToApply === 'dark')
    window.dispatchEvent(new Event('theme-change'))
  }

  const handleBack = () => {
    applyStoredDashboardTheme()
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1)
      return
    }
    navigate(user ? '/dashboard' : '/guest')
  }

  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  const handleSeatSelect = (seat: Seat) => {
    if (!event) return
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${event.eventId}/page`)}`)
      return
    }
    if (!isSeatAvailableForSelect(seat)) return

    setSelectedSeats((prev) => {
      if (prev.some((s) => s.seatId === seat.seatId)) {
        return prev.filter((s) => s.seatId !== seat.seatId)
      }
      if (prev.length >= 4) return prev
      return [...prev, seat]
    })
  }

  const confirmSeats = () => {
    if (!event || selectedSeats.length === 0) return
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${event.eventId}/page`)}`)
      return
    }

    const vipTicket = event.tickets?.find((ticket) => ticket.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((ticket) => !ticket.name.toUpperCase().includes('VIP'))
    const breakdownMap = new Map<number, { ticket: Ticket; count: number }>()
    let totalAmount = 0

    selectedSeats.forEach((seat) => {
      const matchedTicket = event.tickets?.find((ticket) => ticket.categoryTicketId === seat.categoryTicketId) as Ticket | undefined
      if (matchedTicket) {
        totalAmount += matchedTicket.price
        const existing = breakdownMap.get(matchedTicket.categoryTicketId)
        breakdownMap.set(matchedTicket.categoryTicketId, { ticket: matchedTicket, count: (existing?.count ?? 0) + 1 })
      } else if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
      } else if (standardTicket) {
        totalAmount += standardTicket.price
      }
    })

    const firstSeatTicket = event.tickets?.find((ticket) => ticket.categoryTicketId === selectedSeats[0]?.categoryTicketId) as Ticket | undefined
    const ticketToUse = selectedTicket || firstSeatTicket || (selectedSeats[0]?.seatType === 'VIP' ? vipTicket : standardTicket)
    if (!ticketToUse) {
      alert(t.noTicket)
      return
    }

    const ticketBreakdown = Array.from(breakdownMap.values()).map(({ ticket, count }) => ({
      name: ticket.name,
      count,
      price: ticket.price,
    }))

    navigate('/dashboard/payment', {
      state: {
        eventId: event.eventId,
        categoryTicketId: ticketToUse.categoryTicketId,
        seatIds: selectedSeats.map((seat) => seat.seatId),
        seatCodes: selectedSeats.map((seat) => seat.seatCode),
        eventTitle: event.title,
        ticketName: ticketToUse.name,
        ticketBreakdown,
        pricePerTicket: ticketToUse.price,
        quantity: selectedSeats.length,
        totalAmount,
      },
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-orange-500 animate-spin" />
        <p className="text-xs font-bold text-neutral-400 mt-4 uppercase tracking-wider">{t.loading}</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-sm font-bold">{t.error}: {error || t.notFound}</p>
        <button
          onClick={handleBack}
          className="mt-6 px-4 py-2 border border-neutral-800 rounded-xl text-xs font-bold hover:bg-neutral-900 transition-colors"
        >
          {t.back}
        </button>
      </div>
    )
  }

  const now = new Date().toISOString()
  const { eventOngoing, eventEnded } = compareTimeStringsForEventStatus(now, event.startTime, event.endTime)
  const eventClosed = event.status === 'CLOSED' || (event as any).isClosed === true
  const totalAmount = selectedSeats.reduce((sum, seat) => {
    const matchedTicket = event.tickets?.find((ticket) => ticket.categoryTicketId === seat.categoryTicketId)
    if (matchedTicket) return sum + matchedTicket.price
    const vipTicket = event.tickets?.find((ticket) => ticket.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((ticket) => !ticket.name.toUpperCase().includes('VIP'))
    return sum + (seat.seatType === 'VIP' ? vipTicket?.price ?? 0 : standardTicket?.price ?? 0)
  }, 0)

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden text-white font-sans selection:bg-orange-500/30 pb-32">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#09090b]">
        <div
          className="absolute -inset-[18%] blur-[80px] opacity-100 saturate-[260%] scale-110 origin-center pointer-events-none select-none transition-all duration-700"
          style={{
            backgroundImage: `url(${eventBannerImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/[0.04] to-black/[0.12] pointer-events-none" />
      </div>

      <div className="relative z-10 w-full flex flex-col">
        <div className="max-w-[1760px] mx-auto w-full px-5 sm:px-8 pt-5">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-neutral-100 px-4 py-2 rounded-lg font-black tracking-wide transition-all uppercase mb-5"
          >
            <span>←</span> {t.back}
          </button>
        </div>

        <div className="max-w-[1760px] mx-auto w-full px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-14">
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-6 bg-neutral-900/25 backdrop-blur-2xl border border-white/15 dark:border-white/5 shadow-[0_12px_40px_0_rgba(0,0,0,0.35)] p-6 xl:p-8 rounded-2xl space-y-6 transition-all duration-300">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-black/15 shadow-inner">
                {event.bannerUrl ? (
                  <img src={event.bannerUrl} alt={event.title} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-4xl">Image</div>
                )}
              </div>

              <div className="flex items-center gap-4 p-4 bg-black/15 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                  {hostInitial}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-neutral-300 uppercase tracking-wider">{t.hostedBy}</p>
                  <p className="text-base font-black text-neutral-100 mt-0.5 leading-tight truncate">{hostName}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-9 xl:space-y-10">
            <h1 className="pt-1 text-5xl sm:text-6xl xl:text-7xl text-white font-black leading-[0.98]">
              {event.title}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-5 bg-white/12 backdrop-blur-2xl border border-white/20 shadow-[0_12px_40px_0_rgba(0,0,0,0.25)] p-7 rounded-2xl transition-all duration-300 min-h-[150px]">
                <div className="w-14 h-14 rounded-xl border border-white/35 bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-7 h-7 text-orange-400" />
                </div>
                <div className="space-y-2 min-w-0">
                  <p className="text-neutral-300 font-black uppercase tracking-wider text-base">{t.time}</p>
                  <p className="font-black text-neutral-50 text-xl xl:text-2xl leading-tight">{formatDate(event.startTime, pageLanguage)}</p>
                  <p className="text-neutral-200 font-bold text-lg xl:text-xl">{formatTimeRange(event.startTime, event.endTime, pageLanguage)}</p>
                </div>
              </div>

              <div className="flex gap-5 bg-white/12 backdrop-blur-2xl border border-white/20 shadow-[0_12px_40px_0_rgba(0,0,0,0.25)] p-7 rounded-2xl transition-all duration-300 min-h-[150px]">
                <div className="w-14 h-14 rounded-xl border border-white/35 bg-white/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-7 h-7 text-orange-400" />
                </div>
                <div className="space-y-2 min-w-0">
                  <p className="text-neutral-300 font-black uppercase tracking-wider text-base">{t.location}</p>
                  <p className="font-black text-neutral-50 text-xl xl:text-2xl leading-tight">{locationTitle}</p>
                  {locationDetail && <p className="text-neutral-200 font-bold text-base xl:text-lg leading-snug">{locationDetail}</p>}
                </div>
              </div>
            </div>

            <div className="bg-neutral-900/25 backdrop-blur-2xl border border-white/15 dark:border-white/5 shadow-[0_12px_40px_0_rgba(0,0,0,0.35)] p-8 rounded-2xl space-y-7 transition-all duration-300">
              <h3 className="text-2xl font-black text-neutral-100 tracking-wide">{t.registration}</h3>

              {event.tickets && event.tickets.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-neutral-300">{t.chooseTicket}</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {event.tickets.map((ticket) => {
                      const isSoldOut = ticket.remaining === 0 || ticket.status === 'INACTIVE'
                      const availabilityStatus = isSoldOut
                        ? (pageLanguage === 'en' ? 'Sold Out' : 'Hết vé')
                        : (pageLanguage === 'en' ? 'Available' : 'Còn vé')
                      return (
                        <div
                          key={ticket.categoryTicketId}
                          className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center"
                        >
                          <div>
                            <p className="text-sm font-bold text-neutral-100">{ticket.name}</p>
                            {ticket.description && <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">{ticket.description}</p>}
                            <span className={`inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded mt-1.5 ${
                              isSoldOut ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {availabilityStatus}
                            </span>
                          </div>
                          <p className="text-base font-black text-orange-300">{ticket.price.toLocaleString('vi-VN')} đ</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-neutral-400 text-sm font-medium">{t.noTicket}</p>
              )}
            </div>

            <div className="bg-neutral-900/25 backdrop-blur-2xl border border-white/15 dark:border-white/5 shadow-[0_12px_40px_0_rgba(0,0,0,0.35)] p-8 rounded-2xl space-y-4 transition-all duration-300">
              <h3 className="text-sm font-black uppercase tracking-widest text-neutral-300">{t.about}</h3>
              <div className="text-neutral-100 text-base leading-relaxed antialiased font-medium whitespace-pre-wrap max-w-none">
                {event.description}
              </div>
            </div>

            {event.speakerName && (
              <div className="bg-neutral-900/25 backdrop-blur-2xl border border-white/15 dark:border-white/5 shadow-[0_12px_40px_0_rgba(0,0,0,0.35)] p-8 rounded-2xl space-y-4 transition-all duration-300">
                <div className="flex items-center gap-4">
                  {event.speakerAvatarUrl ? (
                    <img src={event.speakerAvatarUrl} alt={event.speakerName} className="w-16 h-16 rounded-full object-cover border-2 border-neutral-700 shadow-md" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-2xl border border-neutral-700">S</div>
                  )}
                  <div>
                    <p className="text-xs font-black uppercase text-neutral-300 tracking-wider">{t.mainSpeaker}</p>
                    <h4 className="text-xl font-bold text-neutral-100">{event.speakerName}</h4>
                  </div>
                </div>
                {event.speakerBio && <p className="text-sm text-neutral-200 leading-relaxed">{event.speakerBio}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky CTA Action Bar */}
      <div className="fixed bottom-0 left-0 w-full z-50 bg-neutral-950/80 backdrop-blur-2xl border-t border-white/10 p-4 flex justify-between items-center px-6 md:px-12 transform transition-transform">
        <div className="hidden sm:block">
          <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">{t.time}</p>
          <p className="text-sm font-bold text-neutral-200">{formatDate(event.startTime, pageLanguage)}</p>
        </div>
        <div className="w-full sm:w-auto">
          {eventClosed || eventEnded ? (
            <button
              disabled
              className="w-full sm:w-auto bg-neutral-800 text-neutral-500 font-bold px-8 py-3 rounded-full border border-neutral-700 cursor-not-allowed text-sm uppercase tracking-wider"
            >
              {pageLanguage === 'en' ? 'Closed' : 'Đã đóng đăng ký'}
            </button>
          ) : (
            <button
              onClick={() => setIsCheckoutModalOpen(true)}
              className="w-full sm:w-auto bg-white text-black font-bold px-8 py-3 rounded-full hover:bg-gray-200 transition-all text-sm uppercase tracking-wider shadow-lg hover:shadow-xl active:scale-98"
            >
              {pageLanguage === 'en' ? 'Get Tickets' : 'Đăng ký ngay'}
            </button>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="relative bg-neutral-950 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 flex flex-col space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            {/* Close Button */}
            <button
              onClick={() => {
                setIsCheckoutModalOpen(false)
                setSelectedSeats([])
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors text-2xl font-bold p-2"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{event.title}</h2>
              <p className="text-sm text-neutral-400 mt-1 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-orange-400" /> {locationTitle} · {locationDetail}
              </p>
            </div>

            {/* Modal Body */}
            <div className="space-y-6">
              {/* Ticket tier selection inside modal if any */}
              {event.tickets && event.tickets.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-neutral-300">{t.chooseTicket}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {event.tickets.map((ticket) => {
                      const isSelected = selectedTicket?.categoryTicketId === ticket.categoryTicketId
                      const isSoldOut = ticket.remaining === 0 || ticket.status === 'INACTIVE'
                      return (
                        <div
                          key={ticket.categoryTicketId}
                          onClick={() => {
                            if (!isSoldOut) setSelectedTicket(ticket)
                          }}
                          className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                            isSoldOut 
                              ? 'border-white/5 bg-neutral-900/10 opacity-50 cursor-not-allowed' 
                              : isSelected 
                                ? 'border-orange-500 bg-orange-500/10 cursor-pointer' 
                                : 'border-white/10 bg-black/15 hover:bg-neutral-900/30 cursor-pointer'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold text-neutral-100">{ticket.name}</p>
                            <p className="text-xs text-neutral-300 mt-1">
                              {t.remaining}: <span className="font-bold">{ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} {t.tickets}</span>
                            </p>
                          </div>
                          <p className="text-sm font-black text-orange-300">{ticket.price.toLocaleString('vi-VN')} đ</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Seat Selection Map inside modal */}
              {event.areaId && (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-neutral-300">{t.chooseSeat}</p>
                  <div className="p-4 rounded-2xl bg-black/20 border border-white/10 overflow-hidden">
                    <SeatGrid
                      seats={allSeats}
                      selectedSeats={selectedSeats}
                      onSeatSelect={handleSeatSelect}
                      maxReached={selectedSeats.length >= 4}
                      disabled={eventEnded || eventClosed || eventOngoing}
                      allowSelect={!eventClosed && !eventEnded && !eventOngoing}
                    />
                  </div>
                </div>
              )}

              {/* Checkout details & Register CTA button */}
              <div className="pt-4 border-t border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm p-4 bg-black/15 rounded-2xl border border-white/10 gap-3">
                  <div>
                    <p className="text-neutral-300">{t.selectedSeats}:</p>
                    <p className="font-bold text-neutral-100 mt-0.5">
                      {selectedSeats.length > 0 ? selectedSeats.map((seat) => seat.seatCode).join(', ') : '---'}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-neutral-300">{t.totalPayment}:</p>
                    <p className="text-lg font-black text-orange-300 mt-0.5">{totalAmount.toLocaleString('vi-VN')} đ</p>
                  </div>
                </div>

                <button
                  onClick={confirmSeats}
                  disabled={selectedSeats.length === 0}
                  className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider text-white transition-all shadow-lg active:scale-98 ${
                    selectedSeats.length > 0
                      ? 'bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-orange-950/30'
                      : 'bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none border border-neutral-850'
                  }`}
                >
                  {selectedSeats.length > 0 ? t.register : t.chooseSeatsToRegister}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
