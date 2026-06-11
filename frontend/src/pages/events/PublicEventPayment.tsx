import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, CreditCard, MapPin, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { SeatGrid, type Seat } from '../../components/common/SeatGrid'
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

type EventDetailExtras = EventDetail & {
  id?: number
  organizerAvatar?: string | null
  organizerAvatarUrl?: string | null
  organizer_avatar?: string | null
  organizer_avatar_url?: string | null
  bannerImg?: string | null
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
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

const formatDateTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PublicEventPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, isAuthenticated, loading: authLoading, isRefreshing } = useAuth()
  const [event, setEvent] = useState<EventDetailExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [promoCode, setPromoCode] = useState('')
  const [currentStep, setCurrentStep] = useState(1)
  const [attendeeName, setAttendeeName] = useState(user?.fullName || '')
  const [attendeeEmail, setAttendeeEmail] = useState(user?.email || '')
  const [attendeePhone, setAttendeePhone] = useState(user?.phone || '')
  const [paymentMethod, setPaymentMethod] = useState<'vnpay' | 'wallet'>('vnpay')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const routeState = (location.state || {}) as { ticketQuantities?: Record<number, number> }

  const hasActiveSession = Boolean(isAuthenticated || user || token || localStorage.getItem('token'))

  useEffect(() => {
    setAttendeeName(user?.fullName || '')
    setAttendeeEmail(user?.email || '')
    setAttendeePhone(user?.phone || '')
  }, [user])

  useEffect(() => {
    if (authLoading || isRefreshing) return
    if (!hasActiveSession) {
      navigate(`/login?redirect=${encodeURIComponent(`/events/${id}/payment`)}`, { replace: true })
    }
  }, [authLoading, hasActiveSession, id, isRefreshing, navigate])

  useEffect(() => {
    if (!id || !hasActiveSession) return

    const fetchEvent = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/events/detail?id=${id}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error('Failed to fetch event details')
        const data = await res.json()
        setEvent(data)
      } catch (err: any) {
        setError(err.message || 'Unable to load event details')
      } finally {
        setLoading(false)
      }
    }

    void fetchEvent()
  }, [hasActiveSession, id])

  useEffect(() => {
    if (!event || loading) return
    const seats = ((event.seats ?? []) as ApiSeat[])
      .map((seat) => normalizeSeat(seat, event.areaId))
      .filter((seat): seat is Seat => Boolean(seat))
    setAllSeats(seats)
    if (!selectedTicket && event.tickets && event.tickets.length > 0) {
      const firstAvailable = (event.tickets as Ticket[]).find((ticket) => ticket.status !== 'INACTIVE' && ticket.remaining !== 0)
      setSelectedTicket(firstAvailable || (event.tickets[0] as Ticket))
    }
  }, [event, loading, selectedTicket])

  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  const handleSeatSelect = (seat: Seat) => {
    if (!isSeatAvailableForSelect(seat)) return
    setSelectedSeats((prev) => {
      if (prev.some((selected) => selected.seatId === seat.seatId)) {
        return prev.filter((selected) => selected.seatId !== seat.seatId)
      }
      if (prev.length >= 4) return prev
      return [...prev, seat]
    })
  }

  const ticketForSeat = (seat: Seat) => {
    if (!event?.tickets) return selectedTicket
    return (event.tickets as Ticket[]).find((ticket) => ticket.categoryTicketId === seat.categoryTicketId) || selectedTicket
  }

  const subtotal = selectedSeats.reduce((sum, seat) => {
    const ticket = ticketForSeat(seat)
    return sum + (ticket?.price ?? 0)
  }, 0)
  const normalizedPromo = promoCode.trim().toUpperCase()
  const discountRate = normalizedPromo === 'FPT20' ? 0.2 : normalizedPromo === 'SAVE10' ? 0.1 : 0
  const discountAmount = Math.round(subtotal * discountRate)
  const totalAmount = Math.max(0, subtotal - discountAmount)

  const requestedQuantities = useMemo(() => {
    const quantities = routeState.ticketQuantities ?? {}
    if (!event?.tickets) return []
    return (event.tickets as Ticket[])
      .map((ticket) => ({
        id: ticket.categoryTicketId,
        name: ticket.name,
        quantity: quantities[ticket.categoryTicketId] ?? 0,
      }))
      .filter((ticket) => ticket.quantity > 0)
  }, [event, routeState.ticketQuantities])

  const ticketBreakdown = useMemo(() => {
    const map = new Map<number, { name: string; count: number; price: number }>()
    selectedSeats.forEach((seat) => {
      const ticket = ticketForSeat(seat)
      if (!ticket) return
      const existing = map.get(ticket.categoryTicketId)
      map.set(ticket.categoryTicketId, {
        name: ticket.name,
        price: ticket.price,
        count: (existing?.count ?? 0) + 1,
      })
    })
    return Array.from(map.values())
  }, [selectedSeats, selectedTicket, event])

  const handleContinueToPayment = () => {
    if (!event || selectedSeats.length === 0) return
    const firstSeatTicket = ticketForSeat(selectedSeats[0])
    const ticketToUse = firstSeatTicket || selectedTicket
    if (!ticketToUse) return

    if (currentStep === 1) {
      setCurrentStep(2)
      return
    }

    if (currentStep === 2) {
      setCurrentStep(3)
      return
    }

    setConfirmationMessage(
      paymentMethod === 'vnpay'
        ? 'VNPAY transaction is ready for secure processing.'
        : 'Internal wallet payment is ready for confirmation.',
    )
  }

  if (authLoading || isRefreshing || loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-blue-500 animate-spin" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
        <p className="text-sm font-bold text-red-400">{error || 'Event not found'}</p>
        <button onClick={() => navigate(`/events/${id}/page`, { replace: true })} className="mt-5 px-4 py-2 rounded-xl border border-white/10">
          Back to event
        </button>
      </div>
    )
  }

  const banner = event.bannerUrl || event.bannerImg || ''
  const locationTitle = event.venueName || event.location || 'FPT location'
  const organizerAvatar =
    event.organizerAvatar ||
    event.organizerAvatarUrl ||
    event.organizer_avatar ||
    event.organizer_avatar_url ||
    ''
  const organizerName = event.organizerName || 'FPT Organizer'

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none bg-[#09090b]">
        {banner && (
          <div
            className="absolute -inset-[20%] blur-[90px] opacity-40 saturate-[220%]"
            style={{ backgroundImage: `url(${banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-neutral-950/75 to-neutral-950" />
      </div>

      <div className="relative z-10 max-w-[1380px] mx-auto px-5 sm:px-8 py-6">
        <button
          type="button"
          onClick={() => navigate(`/events/${id}/page`, { replace: true })}
          className="inline-flex items-center gap-2 text-sm font-bold text-neutral-300 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Event details
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10">
          <main className="space-y-7">
            <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-7">
              <div className="flex flex-wrap gap-3 mb-6">
                {['Choose seats', 'Review order', 'Payment'].map((label, index) => {
                  const step = index + 1
                  const active = currentStep >= step
                  return (
                    <div key={label} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide ${
                      active ? 'bg-blue-600 text-white' : 'bg-white/5 text-neutral-400 border border-white/10'
                    }`}>
                      <span>{step}</span>
                      {label}
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
                <div>
                  <div className="aspect-video rounded-2xl overflow-hidden bg-black/30 border border-white/10">
                    {banner ? <img src={banner} alt={event.title} className="w-full h-full object-cover" /> : null}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black leading-tight mt-5">{event.title}</h1>
                  <div className="flex items-center gap-3 mt-4">
                    {organizerAvatar ? (
                      <img src={organizerAvatar} alt={organizerName} className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-sm font-bold shadow-sm select-none">
                        {organizerName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-neutral-400 font-medium">Organized by</p>
                      <p className="text-sm font-semibold text-white">{organizerName}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mt-5 text-sm text-neutral-300">
                    <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-400" /> {formatDateTime(event.startTime)}</p>
                    <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" /> {locationTitle}</p>
                  </div>
                </div>

                <div className="space-y-5">
                  {currentStep >= 1 && (
                    <>
                  <div className={`${currentStep === 1 ? '' : 'hidden'} rounded-2xl border border-white/10 bg-black/20 p-4`}>
                    <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Ticket tiers</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(event.tickets as Ticket[] | undefined)?.map((ticket) => {
                        const selected = selectedTicket?.categoryTicketId === ticket.categoryTicketId
                        const soldOut = ticket.remaining === 0 || ticket.status === 'INACTIVE'
                        return (
                          <button
                            type="button"
                            key={ticket.categoryTicketId}
                            disabled={soldOut}
                            onClick={() => setSelectedTicket(ticket)}
                            className={`text-left rounded-2xl border p-4 transition-all ${
                              soldOut
                                ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                                : selected
                                  ? 'border-blue-500 bg-blue-500/15'
                                  : 'border-white/10 bg-white/5 hover:bg-white/10'
                            }`}
                          >
                            <p className="font-bold text-white">{ticket.name}</p>
                            <p className="text-sm text-blue-200 font-black mt-1">
                              {ticket.price > 0 ? `${ticket.price.toLocaleString('vi-VN')} đ` : 'Free'}
                            </p>
                            <p className="text-xs text-neutral-400 mt-1">
                              {ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} available
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {currentStep === 2 && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Review order</p>
                        <h2 className="text-2xl font-black mt-2">Attendee information</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Full name</span>
                          <input value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" />
                        </label>
                        <label className="block">
                          <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Phone</span>
                          <input value={attendeePhone} onChange={(event) => setAttendeePhone(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Email</span>
                          <input value={attendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-blue-500" />
                        </label>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-3">Selected seats</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSeats.map((seat) => (
                            <span key={seat.seatId} className="rounded-full bg-blue-500/15 border border-blue-400/25 px-3 py-1 text-sm font-black text-blue-100">{seat.seatCode}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 3 && (
                    <div className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-xl p-5">
                      <div className="mx-auto max-w-xl rounded-3xl bg-white text-slate-950 p-6 sm:p-8 shadow-2xl">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-600">Payment</p>
                        <h2 className="text-2xl font-black mt-2">Thanh toán vé</h2>
                        <p className="text-sm text-slate-500 mt-2">Choose VNPAY or internal wallet to complete this order without leaving the checkout portal.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                          {[
                            { id: 'vnpay' as const, label: 'VNPAY', detail: 'ATM, QR, bank card' },
                            { id: 'wallet' as const, label: 'Ví nội bộ', detail: 'Use wallet balance' },
                          ].map((method) => (
                            <button
                              type="button"
                              key={method.id}
                              onClick={() => setPaymentMethod(method.id)}
                              className={`text-left rounded-2xl border p-4 transition-all ${
                                paymentMethod === method.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <p className="font-black">{method.label}</p>
                              <p className="text-xs text-slate-500 mt-1">{method.detail}</p>
                            </button>
                          ))}
                        </div>
                        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
                          <div className="flex justify-between"><span>Tickets</span><span className="font-bold">{selectedSeats.length}</span></div>
                          <div className="flex justify-between"><span>Discount</span><span className="font-bold">-{discountAmount.toLocaleString('vi-VN')} Ä‘</span></div>
                          <div className="flex justify-between text-lg font-black pt-2 border-t border-slate-200"><span>Total</span><span>{totalAmount.toLocaleString('vi-VN')} Ä‘</span></div>
                        </div>
                        {confirmationMessage && <p className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-semibold text-emerald-700">{confirmationMessage}</p>}
                      </div>
                    </div>
                  )}

                  <div className={`${currentStep === 1 ? '' : 'hidden'} rounded-2xl border border-white/10 bg-black/20 p-4 overflow-hidden`}>
                    <p className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-3">Seat selection</p>
                    <SeatGrid
                      seats={allSeats}
                      selectedSeats={selectedSeats}
                      onSeatSelect={handleSeatSelect}
                      maxReached={selectedSeats.length >= 4}
                      allowSelect
                    />
                  </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-6 h-fit rounded-3xl border border-white/10 bg-neutral-950/85 backdrop-blur-xl p-6 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-2 mb-5">
              <CreditCard className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-black">Order summary</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 text-neutral-300">
                <span>Selected seats</span>
                <span className="font-bold text-white">{selectedSeats.length || 0}</span>
              </div>
              <div className="min-h-[44px] rounded-2xl bg-white/5 border border-white/10 p-3 text-neutral-300">
                {selectedSeats.length > 0 ? selectedSeats.map((seat) => seat.seatCode).join(', ') : 'No seats selected'}
              </div>

              {requestedQuantities.length > 0 && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Requested quantities</p>
                  {requestedQuantities.map((ticket) => (
                    <div key={ticket.id} className="flex justify-between gap-4 text-neutral-300">
                      <span>{ticket.name}</span>
                      <span className="font-bold text-white">x {ticket.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              {ticketBreakdown.length > 0 && (
                <div className="space-y-2 pt-2">
                  {ticketBreakdown.map((item) => (
                    <div key={item.name} className="flex justify-between gap-4 text-neutral-300">
                      <span>{item.name} x {item.count}</span>
                      <span className="font-bold text-white">{(item.price * item.count).toLocaleString('vi-VN')} đ</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-white/10 space-y-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Discount code</span>
                  <input
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    placeholder="SAVE10 or FPT20"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </label>
                <div className="flex justify-between gap-4 text-neutral-300">
                  <span>Subtotal</span>
                  <span>{subtotal.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between gap-4 text-neutral-300">
                  <span>Discount</span>
                  <span>-{discountAmount.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between gap-4 text-lg font-black text-white">
                  <span>Total</span>
                  <span>{totalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinueToPayment}
              disabled={selectedSeats.length === 0}
              className={`mt-6 w-full rounded-xl py-4 text-sm font-black uppercase tracking-wide transition-all ${
                selectedSeats.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
              }`}
            >
              {currentStep === 1 ? 'Review order' : currentStep === 2 ? 'Continue to payment' : paymentMethod === 'vnpay' ? 'Thanh toán vé via VNPAY' : 'Pay with internal wallet'}
            </button>

            <div className="mt-4 flex items-start gap-2 text-xs text-neutral-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              Seats are reserved only after the final payment step succeeds.
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
