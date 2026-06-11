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

  return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
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
    loading: pageLanguage === 'en' ? 'Loading event page...' : 'Dang tai trang su kien...',
    error: pageLanguage === 'en' ? 'Error' : 'Loi',
    notFound: pageLanguage === 'en' ? 'Event not found' : 'Khong tim thay su kien',
    back: pageLanguage === 'en' ? 'Back' : 'Quay lai',
    hostedBy: pageLanguage === 'en' ? 'Hosted by' : 'To chuc boi',
    defaultLocation: pageLanguage === 'en' ? 'FPT location' : 'Dia diem FPT',
    area: pageLanguage === 'en' ? 'Area' : 'Khu vuc',
    floor: pageLanguage === 'en' ? 'Floor' : 'Tang',
    registration: pageLanguage === 'en' ? 'Registration' : 'Dang ky tham gia',
    chooseTicket: pageLanguage === 'en' ? 'Choose ticket tier' : 'Chon hang ve',
    remaining: pageLanguage === 'en' ? 'Remaining' : 'Con lai',
    tickets: pageLanguage === 'en' ? 'tickets' : 've',
    chooseSeat: pageLanguage === 'en' ? 'Choose your seat' : 'Chon vi tri ngoi cua ban',
    selectedSeats: pageLanguage === 'en' ? 'Selected seats' : 'Ghe chon',
    totalPayment: pageLanguage === 'en' ? 'Total payment' : 'Tong thanh toan',
    register: pageLanguage === 'en' ? 'Register for Event' : 'Dang ky su kien',
    chooseSeatsToRegister: pageLanguage === 'en' ? 'Choose seats to register' : 'Chon ghe de dang ky',
    about: pageLanguage === 'en' ? 'About Event' : 'Mo ta su kien',
    mainSpeaker: pageLanguage === 'en' ? 'Main Speaker' : 'Dien gia chinh',
    noTicket: pageLanguage === 'en' ? 'No matching ticket type found' : 'Khong tim thay loai ve phu hop',
    organizerFallback: pageLanguage === 'en' ? 'Event Organizer' : 'Nguoi to chuc su kien',
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
        setError(err.message || (pageLanguage === 'en' ? 'Unable to load event details' : 'Khong the tai thong tin su kien'))
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
        <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-blue-500 animate-spin" />
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
  const eventBannerImg = event.bannerUrl || (event as (EventDetail & { bannerImg?: string | null })).bannerImg || ''
  const organizerId = event.organizerId ?? (event as EventDetail & { organizer_id?: number }).organizer_id
  const hostName = event.organizerName || (organizerId ? `${t.organizerFallback} #${organizerId}` : t.organizerFallback)
  const hostInitial = hostName.trim().charAt(0).toUpperCase() || 'F'
  const locationTitle = event.venueName || event.location || t.defaultLocation
  const locationDetail = [
    event.areaName ? `${t.area}: ${event.areaName}` : '',
    event.floor ? `${t.floor} ${event.floor}` : '',
  ].filter(Boolean).join(' · ')
  const totalAmount = selectedSeats.reduce((sum, seat) => {
    const matchedTicket = event.tickets?.find((ticket) => ticket.categoryTicketId === seat.categoryTicketId)
    if (matchedTicket) return sum + matchedTicket.price
    const vipTicket = event.tickets?.find((ticket) => ticket.name.toUpperCase().includes('VIP'))
    const standardTicket = event.tickets?.find((ticket) => !ticket.name.toUpperCase().includes('VIP'))
    return sum + (seat.seatType === 'VIP' ? vipTicket?.price ?? 0 : standardTicket?.price ?? 0)
  }, 0)

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden text-white font-sans selection:bg-blue-500/30 pb-16">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#09090b]">
        <div
          className="absolute -inset-[18%] blur-[80px] opacity-90 saturate-[220%] scale-110 origin-center pointer-events-none select-none transition-all duration-700"
          style={{
            backgroundImage: `url(${eventBannerImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/70 pointer-events-none" />
      </div>

      <div className="relative z-10 w-full flex flex-col">
        <div className="max-w-[1480px] mx-auto w-full px-5 sm:px-8 pt-5">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-neutral-100 px-4 py-2 rounded-lg font-black tracking-wide transition-all uppercase mb-5"
          >
            <span aria-hidden="true">←</span> {t.back}
          </button>
        </div>

        <div className="max-w-[1480px] mx-auto w-full px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <div className="aspect-video rounded-2xl overflow-hidden bg-black/20 border border-white/10 shadow-[0_18px_52px_rgba(0,0,0,0.4)]">
              {event.bannerUrl ? (
                <img src={event.bannerUrl} alt={event.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-4xl">Image</div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-4">
              <p className="text-xs font-black uppercase tracking-widest text-neutral-400">{t.hostedBy}</p>
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-base shadow-md">
                {hostInitial}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-lg text-white truncate">{hostName}</p>
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl text-white font-black leading-[1.02] mb-7">
              {event.title}
            </h1>

            <div className="flex flex-col gap-4 mb-8">
              <div className="flex items-start gap-4">
                <Calendar className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-neutral-200 text-lg font-bold leading-tight">{formatDate(event.startTime, pageLanguage)}</p>
                  <p className="text-neutral-300 text-base font-medium mt-1">{formatTimeRange(event.startTime, event.endTime, pageLanguage)}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <MapPin className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-neutral-200 text-lg font-bold leading-tight">{locationTitle}</p>
                  {locationDetail && <p className="text-neutral-300 text-base font-medium mt-1">{locationDetail}</p>}
                </div>
              </div>
            </div>

            <div className="bg-neutral-950/70 border border-white/15 rounded-3xl p-7 lg:p-8 backdrop-blur-xl shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
              <h3 className="text-2xl font-black text-neutral-50 tracking-wide mb-6">{t.registration}</h3>

              {event.tickets && event.tickets.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {event.tickets.map((ticket) => (
                    <div key={ticket.categoryTicketId} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-white truncate">{ticket.name}</p>
                        {ticket.description && <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">{ticket.description}</p>}
                      </div>
                      <p className="text-lg font-black text-neutral-50 whitespace-nowrap">{ticket.price.toLocaleString('vi-VN')} đ</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-400 text-sm font-medium">{t.noTicket}</p>
              )}

              {eventClosed || eventEnded ? (
                <button
                  disabled
                  className="w-full bg-neutral-800 text-neutral-500 font-bold py-4 rounded-xl mt-6 text-lg uppercase tracking-wide cursor-not-allowed border border-neutral-700"
                >
                  {pageLanguage === 'en' ? 'Closed' : 'Da dong dang ky'}
                </button>
              ) : (
                <button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl mt-6 transition-all text-lg shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] uppercase tracking-wide"
                  onClick={() => setIsCheckoutModalOpen(true)}
                >
                  Register Now
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-[1480px] mx-auto w-full px-5 sm:px-8 mt-10 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div className="lg:col-start-2 space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-neutral-300">{t.about}</h3>
              <div className="text-neutral-100 text-base leading-relaxed antialiased font-medium whitespace-pre-wrap max-w-none">
                {event.description}
              </div>
            </div>

            {event.speakerName && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl space-y-4">
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

      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="relative bg-neutral-950 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 flex flex-col space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <button
              onClick={() => {
                setIsCheckoutModalOpen(false)
                setSelectedSeats([])
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors text-2xl font-bold p-2"
            >
              x
            </button>

            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{event.title}</h2>
              <p className="text-sm text-neutral-400 mt-1 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-400" /> {locationTitle}{locationDetail ? ` · ${locationDetail}` : ''}
              </p>
            </div>

            <div className="space-y-6">
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
                                ? 'border-blue-500 bg-blue-500/10 cursor-pointer'
                                : 'border-white/10 bg-black/15 hover:bg-neutral-900/30 cursor-pointer'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold text-neutral-100">{ticket.name}</p>
                            <p className="text-xs text-neutral-300 mt-1">
                              {t.remaining}: <span className="font-bold">{ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} {t.tickets}</span>
                            </p>
                          </div>
                          <p className="text-sm font-black text-blue-300">{ticket.price.toLocaleString('vi-VN')} đ</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

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
                    <p className="text-lg font-black text-blue-300 mt-0.5">{totalAmount.toLocaleString('vi-VN')} đ</p>
                  </div>
                </div>

                <button
                  onClick={confirmSeats}
                  disabled={selectedSeats.length === 0}
                  className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-wider text-white transition-all shadow-lg active:scale-98 ${
                    selectedSeats.length > 0
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-950/30'
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
