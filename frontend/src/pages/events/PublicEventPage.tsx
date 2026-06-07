import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import type { EventDetail } from '../../types/event'
import { Calendar, MapPin, Users, Clock, ArrowLeft, Check, Bell } from 'lucide-react'
import { formatWallClockDateTimeSimple, compareTimeStringsForEventStatus } from '../../utils/dateFormat'
import { SeatGrid, type Seat } from '../../components/common/SeatGrid'

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

// Format date helpers
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

// Programmatic Dynamic Ambient Color Extractor Hook
const useDominantColor = (imageUrl: string | undefined | null) => {
  const [dominantColor, setDominantColor] = useState('rgba(249, 115, 22, 0.15)') // Default FPT Orange-red glow

  useEffect(() => {
    if (!imageUrl) return

    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = imageUrl

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = 10
        canvas.height = 10
        ctx.drawImage(img, 0, 0, 10, 10)

        const imageData = ctx.getImageData(0, 0, 10, 10).data
        let r = 0, g = 0, b = 0, count = 0

        for (let i = 0; i < imageData.length; i += 4) {
          const alpha = imageData[i + 3]
          if (alpha < 100) continue
          const sum = imageData[i] + imageData[i + 1] + imageData[i + 2]
          // Filter out too dark/too bright pixels to keep the glow vibrant
          if (sum > 680 || sum < 120) continue

          r += imageData[i]
          g += imageData[i + 1]
          b += imageData[i + 2]
          count++
        }

        if (count > 0) {
          r = Math.floor(r / count)
          g = Math.floor(g / count)
          b = Math.floor(b / count)
          setDominantColor(`rgba(${r}, ${g}, ${b}, 0.22)`)
        } else {
          // Fallback simple average
          let tr = 0, tg = 0, tb = 0
          for (let i = 0; i < imageData.length; i += 4) {
            tr += imageData[i]
            tg += imageData[i + 1]
            tb += imageData[i + 2]
          }
          const total = imageData.length / 4
          tr = Math.floor(tr / total)
          tg = Math.floor(tg / total)
          tb = Math.floor(tb / total)
          setDominantColor(`rgba(${tr}, ${tg}, ${tb}, 0.18)`)
        }
      } catch (e) {
        console.warn('Failed to extract dominant color:', e)
        setDominantColor('rgba(249, 115, 22, 0.18)')
      }
    }

    img.onerror = () => {
      setDominantColor('rgba(249, 115, 22, 0.18)')
    }
  }, [imageUrl])

  return dominantColor
}

export default function PublicEventPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, currentLanguage } = useAuth()

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [subscribed, setSubscribed] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [allSeats, setAllSeats] = useState<Seat[]>([])
  const [loadingSeats, setLoadingSeats] = useState(false)

  // Fetch Event Detail
  useEffect(() => {
    if (!id) return
    const fetchEvent = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/events/detail?id=${id}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        })
        if (!res.ok) {
          throw new Error('Failed to fetch event details')
        }
        const data = await res.json()
        setEvent(data)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Không thể tải thông tin sự kiện')
      } finally {
        setLoading(false)
      }
    }
    fetchEvent()
  }, [id])

  // Extract Seats
  useEffect(() => {
    if (!event || loading) return

    setLoadingSeats(true)
    try {
      const rawSeats = (event.seats ?? []) as ApiSeat[]
      const normalizedSeats = rawSeats
        .map((seat) => {
          const seatId = seat.seatId ? Number(seat.seatId) : undefined
          const seatCode = seat.seatCode?.toString()
          const areaId = seat.areaId ? Number(seat.areaId) : undefined

          if (!seatId || !seatCode || !areaId) return null

          const categoryTicketId = seat.categoryTicketId ? Number(seat.categoryTicketId) : null
          const rawStatus = String(seat.status ?? '').trim().toUpperCase()
          let mappedStatus = 'ACTIVE'
          if (rawStatus === 'BOOKED' || rawStatus === 'CHECKED_IN' || rawStatus === 'OCCUPIED') {
            mappedStatus = 'BOOKED'
          } else if (rawStatus === 'PENDING' || rawStatus === 'HOLD' || rawStatus === 'RESERVED') {
            mappedStatus = 'PENDING'
          }

          return {
            seatId,
            seatCode,
            rowNo: seat.rowNo,
            seatRow: seat.seatRow,
            colNo: seat.colNo != null ? String(seat.colNo) : undefined,
            seatColumn: seat.seatColumn ? Number(seat.seatColumn) : undefined,
            status: mappedStatus,
            seatType: seat.seatType,
            categoryTicketId,
            categoryName: seat.categoryName,
            areaId,
          } as Seat
        })
        .filter((s): s is Seat => s !== null)

      setAllSeats(normalizedSeats)
    } catch (err) {
      console.error(err)
      setAllSeats([])
    } finally {
      setLoadingSeats(false)
    }
  }, [event, loading])

  // Programmatic Glow background extract
  const dominantColor = useDominantColor(event?.bannerUrl)

  const isSeatAvailableForSelect = (seat: Seat) => {
    const status = String(seat.status ?? '').toUpperCase()
    return status === 'ACTIVE' || status === 'AVAILABLE'
  }

  const handleSeatSelect = (seat: Seat) => {
    if (!event) return
    if (!isSeatAvailableForSelect(seat)) return

    setSelectedSeats((prev) => {
      const exists = prev.some((s) => s.seatId === seat.seatId)
      if (exists) {
        return prev.filter((s) => s.seatId !== seat.seatId)
      }
      if (prev.length >= 4) return prev
      return [...prev, seat]
    })
  }

  const confirmSeats = () => {
    if (!event || selectedSeats.length === 0) return

    if (!user) {
      navigate(`/login?redirect=/events/${event.eventId}/page`)
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
      alert('Không tìm thấy loại vé phù hợp')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-orange-500 animate-spin"></div>
        <p className="text-xs font-bold text-neutral-400 mt-4 uppercase tracking-wider">Đang tải trang sự kiện...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
        <p className="text-red-500 text-sm font-bold">Lỗi: {error || 'Không tìm thấy sự kiện'}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-6 px-4 py-2 border border-neutral-800 rounded-xl text-xs font-bold hover:bg-neutral-900 transition-colors"
        >
          Quay lại
        </button>
      </div>
    )
  }

  const now = new Date().toISOString()
  const { eventOngoing, eventEnded } = compareTimeStringsForEventStatus(now, event.startTime, event.endTime)
  const eventClosed = event.status === 'CLOSED' || (event as any).isClosed === true

  let totalAmount = 0
  selectedSeats.forEach((seat) => {
    const matchedTicket = event.tickets?.find((t) => t.categoryTicketId === seat.categoryTicketId)
    if (matchedTicket) {
      totalAmount += matchedTicket.price
    } else {
      const vipTicket = event.tickets?.find((t) => t.name.toUpperCase().includes('VIP'))
      const standardTicket = event.tickets?.find((t) => !t.name.toUpperCase().includes('VIP'))
      if (seat.seatType === 'VIP' && vipTicket) {
        totalAmount += vipTicket.price
      } else if (standardTicket) {
        totalAmount += standardTicket.price
      }
    }
  })

  return (
    <div className="relative w-full min-h-screen p-6 overflow-x-hidden text-white bg-neutral-950 font-sans selection:bg-orange-500/30 pb-20">
      {/* Dynamic halo background extractor */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20 blur-[120px] saturate-150 scale-110"
          style={{ 
            backgroundImage: `url(${event.bannerUrl || (event as any).bannerImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/60 via-neutral-950/90 to-neutral-950 mix-blend-multiply" />
      </div>

      <div className="relative z-10 w-full flex flex-col">
        {/* Top navigation header */}
        <div className="max-w-6xl mx-auto w-full px-4 pt-6">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors mb-6 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span> QUAY LẠI
          </button>
        </div>

        {/* Asymmetrical Split Column Layout */}
        <div className="max-w-6xl mx-auto w-full px-4 grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
          {/* LEFT COLUMN: Sticky Card (4 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-6 bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl space-y-5">
              {/* Square cover image wrapper */}
              <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-800/20 shadow-inner">
                {event.bannerUrl ? (
                  <img
                    src={event.bannerUrl}
                    alt={event.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-4xl">🖼️</div>
                )}
              </div>

              {/* Hosted By layout */}
              <div className="flex items-center justify-between p-3.5 bg-black/20 rounded-2xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold shadow-md">
                    F
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-neutral-450 uppercase tracking-wider">Tổ chức bởi</p>
                    <p className="text-xs font-bold text-neutral-100 mt-0.5">{event.venueName || 'FPT University'}</p>
                  </div>
                </div>

                {/* Subscribe Trigger Button */}
                <button
                  onClick={() => setSubscribed(!subscribed)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                    subscribed
                      ? 'bg-neutral-800 text-neutral-350 border border-neutral-700'
                      : 'bg-white text-neutral-950 hover:bg-neutral-100 shadow-sm'
                  }`}
                >
                  {subscribed ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      Subscribed
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" />
                      Subscribe
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Expansive details (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            {/* Header block */}
            <div className="space-y-4">
              <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-orange-500/20">
                Sự kiện đặc sắc
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                {event.title}
              </h1>
            </div>

            {/* Time/Date & Location Scheduler grids */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Time slot cell */}
              <div className="flex gap-4 bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl">
                <Calendar className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="text-neutral-450 font-black uppercase tracking-wider">Thời gian diễn ra</p>
                  <p className="font-bold text-neutral-100">{formatLumaDate(event.startTime, currentLanguage)}</p>
                  <p className="text-neutral-300 font-medium">{formatLumaTimeRange(event.startTime, event.endTime, currentLanguage)}</p>
                </div>
              </div>

              {/* Address Pin cell */}
              <div className="flex gap-4 bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl">
                <MapPin className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="text-neutral-450 font-black uppercase tracking-wider">Địa điểm tổ chức</p>
                  <p className="font-bold text-neutral-100">{event.venueName || 'Địa điểm FPT'}</p>
                  {event.areaName && (
                    <p className="text-neutral-300 font-medium">
                      Khu vực: {event.areaName} {event.floor ? `· Tầng ${event.floor}` : ''}
                    </p>
                  )}
                  {event.location && (
                    <p className="text-neutral-400 font-medium">{event.location}</p>
                  )}
                </div>
              </div>
            </div>

            {/* DYNAMIC REGISTRATION CARD MATRIX */}
            <div className="bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl space-y-6">
              <h3 className="text-base font-black text-neutral-100 tracking-wide">Đăng ký tham gia</h3>

              {eventClosed || eventEnded ? (
                <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-4 text-xs text-amber-300 leading-relaxed">
                  Sự kiện này đã đóng. Bạn không thể thực hiện đặt vé vào lúc này.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Tickets list */}
                  {event.tickets && event.tickets.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-450">Chọn hạng vé</p>
                      <div className="grid grid-cols-1 gap-2.5">
                        {event.tickets.map((ticket) => {
                          const isSelected = selectedTicket?.categoryTicketId === ticket.categoryTicketId
                          return (
                            <div
                              key={ticket.categoryTicketId}
                              onClick={() => setSelectedTicket(ticket)}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                                isSelected
                                  ? 'border-orange-500 bg-orange-500/10'
                                  : 'border-white/5 bg-black/25 hover:bg-neutral-900/40'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold text-neutral-100">{ticket.name}</p>
                                {ticket.description && (
                                  <p className="text-[10px] text-neutral-400 mt-0.5 line-clamp-1">{ticket.description}</p>
                                )}
                                <p className="text-[10px] text-neutral-400 mt-1">
                                  Còn lại: <span className="font-bold">{ticket.remaining !== undefined ? ticket.remaining : ticket.maxQuantity} vé</span>
                                </p>
                              </div>
                              <p className="text-sm font-black text-orange-400">
                                {ticket.price.toLocaleString('vi-VN')} đ
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Seat picker grid if areaId exists */}
                  {event.areaId && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-450">Chọn vị trí ngồi của bạn</p>
                      <div className="p-4 rounded-2xl bg-black/35 border border-white/5 overflow-hidden">
                        <SeatGrid
                          seats={allSeats}
                          loading={loadingSeats}
                          selectedSeats={selectedSeats}
                          onSeatSelect={handleSeatSelect}
                          maxReached={selectedSeats.length >= 4}
                          disabled={eventEnded || eventClosed || eventOngoing}
                          allowSelect={!eventClosed && !eventEnded && !eventOngoing}
                        />
                      </div>
                    </div>
                  )}

                  {/* Confirm section */}
                  <div className="pt-2 border-t border-white/5 space-y-4">
                    {selectedSeats.length > 0 && (
                      <div className="flex items-center justify-between text-xs p-3.5 bg-black/20 rounded-2xl border border-white/5">
                        <div>
                          <p className="text-neutral-400">Ghế chọn:</p>
                          <p className="font-bold text-neutral-100 mt-0.5">{selectedSeats.map(s => s.seatCode).join(', ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-neutral-400">Tổng thanh toán:</p>
                          <p className="text-sm font-black text-orange-400 mt-0.5">{totalAmount.toLocaleString('vi-VN')} đ</p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={confirmSeats}
                      disabled={selectedSeats.length === 0}
                      className={`w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white transition-all shadow-lg active:scale-98 ${
                        selectedSeats.length > 0
                          ? 'bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-orange-950/30 animate-pulse'
                          : 'bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none border border-neutral-850'
                      }`}
                    >
                      {selectedSeats.length > 0 ? 'Register for Event' : 'Chọn ghế để đăng ký'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Description breaking section */}
            <div className="bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">About Event</h3>
              <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap max-w-none">
                {event.description}
              </div>
            </div>

            {/* Speaker segment detail */}
            {event.speakerName && (
              <div className="bg-neutral-900/40 backdrop-blur-xl border border-white/5 shadow-2xl p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-4">
                  {event.speakerAvatarUrl ? (
                    <img
                      src={event.speakerAvatarUrl}
                      alt={event.speakerName}
                      className="w-16 h-16 rounded-full object-cover border-2 border-neutral-700 shadow-md"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-2xl border border-neutral-700">👤</div>
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-450 tracking-wider">Diễn giả chính</p>
                    <h4 className="text-lg font-bold text-neutral-100">{event.speakerName}</h4>
                  </div>
                </div>
                {event.speakerBio && (
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {event.speakerBio}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
