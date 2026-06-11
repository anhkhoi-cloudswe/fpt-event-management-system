import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`

const resolveWalletBalance = (user: ReturnType<typeof useAuth>['user']) => {
  if (!user) return 0
  if (typeof user.wallet === 'number') return user.wallet
  if (typeof user.wallet?.balance === 'number') return user.wallet.balance
  return user.balance ?? user.wallet_balance ?? 0
}

export default function PublicEventPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
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
  const [activeMethod, setActiveMethod] = useState<'qr' | 'wallet'>('qr')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [processingOrder, setProcessingOrder] = useState(false)

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
        setEvent(await res.json())
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
  const walletBalance = resolveWalletBalance(user)
  const walletCanPay = walletBalance >= totalAmount

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

  const buildPaymentPayload = () => {
    if (!event || selectedSeats.length === 0) return null
    const firstSeatTicket = ticketForSeat(selectedSeats[0])
    const categoryTicketId = firstSeatTicket?.categoryTicketId || selectedTicket?.categoryTicketId
    if (!categoryTicketId) return null

    return {
      eventId: Number(event.eventId || event.id || id),
      categoryTicketId: Number(categoryTicketId),
      seatIds: selectedSeats.map((seat) => Number(seat.seatId)),
    }
  }

  const createBackendOrder = async () => {
    const payload = buildPaymentPayload()
    if (!payload || processingOrder) return null

    const authToken = token || localStorage.getItem('token') || ''
    setProcessingOrder(true)
    setError(null)

    try {
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const rawText = await response.text()
      let data: any = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        data = { message: rawText }
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Unable to create payment order')
      }

      return data
    } catch (err: any) {
      setError(err.message || 'Unable to create payment order')
      return null
    } finally {
      setProcessingOrder(false)
    }
  }

  const handleContinueToPayment = async () => {
    if (!event || selectedSeats.length === 0) return
    const firstSeatTicket = ticketForSeat(selectedSeats[0])
    if (!firstSeatTicket && !selectedTicket) return

    if (currentStep === 1) {
      setCurrentStep(2)
      return
    }

    if (currentStep === 2) {
      if (totalAmount <= 0) {
        const data = await createBackendOrder()
        if (data?.free === true) {
          navigate(`/payment-success?status=success&method=free&ticketIds=${encodeURIComponent(data.ticketIds || '')}`, { replace: true })
        }
        return
      }
      setCurrentStep(3)
      return
    }

    if (activeMethod === 'wallet' && !walletCanPay) return
    setConfirmationMessage(activeMethod === 'qr' ? 'Đã ghi nhận yêu cầu xác nhận chuyển khoản SePay.' : 'Đã ghi nhận yêu cầu thanh toán bằng Ví nội bộ FPT.')
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
  const eventKey = event.eventId || event.id || id || 'event'
  const userId = user?.id || 'GUEST'
  const transferMessage = `FEMS_${eventKey}_${userId || 'GUEST'}`
  const vietQrSrc = `https://qr.sepay.vn/img?acc=${import.meta.env.VITE_BANK_ACC || '2911121319'}&bank=${import.meta.env.VITE_BANK_NAME || 'MB'}&amount=${totalAmount}&des=${encodeURIComponent(transferMessage)}`

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
                  {currentStep === 1 && (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
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
                                className={`text-left rounded-2xl border p-4 ${
                                  soldOut
                                    ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                                    : selected
                                      ? 'border-blue-500 bg-blue-500/15'
                                      : 'border-white/10 bg-white/5'
                                }`}
                              >
                                <p className="font-bold text-white">{ticket.name}</p>
                                <p className="text-sm text-blue-200 font-black mt-1">
                                  {ticket.price > 0 ? formatCurrency(ticket.price) : 'Free'}
                                </p>
                                <p className="text-xs text-neutral-400 mt-1">
                                  {ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} available
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 overflow-hidden">
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

                  {currentStep === 2 && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-6 space-y-6">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Review order</p>
                        <h2 className="text-2xl font-black mt-2">Attendee information</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">Full name</span>
                          <input value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500" />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">Phone</span>
                          <input value={attendeePhone} onChange={(event) => setAttendeePhone(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500" />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase mb-2 block">Email</span>
                          <input value={attendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none focus:border-blue-500" />
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
                    <div className="bg-neutral-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 space-y-6 text-white shadow-[0_12px_40px_0_rgba(0,0,0,0.5)]">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-blue-400">Payment</p>
                        <h2 className="text-2xl font-black mt-2">Thanh toán vé</h2>
                        <p className="text-xs text-neutral-400 mt-1">SePay QR hoặc FPT Wallet</p>
                      </div>

                      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveMethod('qr')}
                          className={`rounded-xl px-2 py-2.5 text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
                            activeMethod === 'qr' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          VietQR SePay
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMethod('wallet')}
                          className={`rounded-xl px-2 py-2.5 text-[11px] sm:text-xs font-black transition-all whitespace-nowrap ${
                            activeMethod === 'wallet' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          FPT Wallet
                        </button>
                      </div>

                      {activeMethod === 'qr' ? (
                        <div className="flex flex-col items-center justify-center text-center py-2 space-y-4">
                          <div className="bg-white p-4 rounded-2xl border border-white/20 shadow-lg inline-block transform transition-transform hover:scale-105 duration-300">
                            <img
                              src={vietQrSrc}
                              alt="VietQR SePay Auto Payment"
                              className="w-56 h-56 object-contain"
                            />
                          </div>
                          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-mono text-neutral-300">
                            <span className="text-neutral-500">Nội dung</span>
                            <span>{transferMessage}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-bold text-neutral-400">Số dư hiện tại</span>
                            <span className="text-xl font-black text-white">{formatCurrency(walletBalance)}</span>
                          </div>
                          {walletCanPay ? (
                            <p className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-sm font-medium">
                              Ví đủ số dư. Bạn có thể xác nhận thanh toán ngay.
                            </p>
                          ) : (
                            <p className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium">
                              Số dư tài khoản không đủ
                            </p>
                          )}
                        </div>
                      )}

                      {confirmationMessage && (
                        <p className="rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 p-4 text-sm font-medium">
                          {confirmationMessage}
                        </p>
                      )}
                    </div>
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

              {ticketBreakdown.length > 0 && (
                <div className="space-y-2 pt-2">
                  {ticketBreakdown.map((item) => (
                    <div key={item.name} className="flex justify-between gap-4 text-neutral-300">
                      <span>{item.name} x {item.count}</span>
                      <span className="font-bold text-white">{formatCurrency(item.price * item.count)}</span>
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
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-4 text-neutral-300">
                  <span>Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex justify-between gap-4 text-lg font-black text-white">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinueToPayment}
              disabled={processingOrder || selectedSeats.length === 0 || (currentStep === 3 && activeMethod === 'wallet' && !walletCanPay)}
              className={`mt-6 w-full rounded-xl py-4 text-sm font-black uppercase tracking-wide transition-all ${
                !processingOrder && selectedSeats.length > 0 && !(currentStep === 3 && activeMethod === 'wallet' && !walletCanPay)
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
              }`}
            >
              {currentStep === 1 ? 'Review order' : currentStep === 2 ? (totalAmount <= 0 ? 'Hoàn tất đăng ký' : 'Continue to payment') : 'Xác nhận thanh toán'}
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
