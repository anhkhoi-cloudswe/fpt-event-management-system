import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calendar, MapPin, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
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

type EventDetailExtras = EventDetail & {
  id?: number
  organizer_id?: number
  organizerAvatar?: string | null
  organizerAvatarUrl?: string | null
  organizer_avatar?: string | null
  organizer_avatar_url?: string | null
  bannerImg?: string | null
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
    organizedBy: pageLanguage === 'en' ? 'Organized by' : 'To chuc boi',
    defaultLocation: pageLanguage === 'en' ? 'FPT location' : 'Dia diem FPT',
    area: pageLanguage === 'en' ? 'Area' : 'Khu vuc',
    floor: pageLanguage === 'en' ? 'Floor' : 'Tang',
    registration: pageLanguage === 'en' ? 'Registration' : 'Dang ky tham gia',
    capacity: pageLanguage === 'en' ? 'Capacity' : 'Suc chua',
    seats: pageLanguage === 'en' ? 'seats' : 'cho',
    about: pageLanguage === 'en' ? 'About Event' : 'Mo ta su kien',
    noTicket: pageLanguage === 'en' ? 'No matching ticket type found' : 'Khong tim thay loai ve phu hop',
    organizerFallback: pageLanguage === 'en' ? 'FPT Organizer' : 'FPT Organizer',
    register: pageLanguage === 'en' ? 'Register Now' : 'Dang ky ngay',
  }

  const [event, setEvent] = useState<EventDetailExtras | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const eventId = event.eventId || event.id || Number(id)
  const eventBannerImg = event.bannerUrl || event.bannerImg || ''
  const organizerId = event.organizerId ?? event.organizer_id
  const organizerName = event.organizerName || (organizerId ? `${t.organizerFallback} #${organizerId}` : t.organizerFallback)
  const organizerAvatar =
    event.organizerAvatar ||
    event.organizerAvatarUrl ||
    event.organizer_avatar ||
    event.organizer_avatar_url ||
    '/default-avatar.png'
  const locationTitle = event.venueName || event.location || t.defaultLocation
  const locationDetail = [
    event.areaName ? `${t.area}: ${event.areaName}` : '',
    event.floor ? `${t.floor} ${event.floor}` : '',
  ].filter(Boolean).join(' · ')
  const eventClosed = event.status === 'CLOSED' || (event as any).isClosed === true
  const eventEnded = new Date(event.endTime).getTime() < Date.now()

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

            <div className="flex items-center gap-3 mt-4 mb-6">
              <img src={organizerAvatar} className="w-10 h-10 rounded-full border border-white/10 object-cover" alt={organizerName} />
              <div>
                <p className="text-xs text-neutral-400 font-medium">{t.organizedBy}</p>
                <p className="text-sm font-semibold text-white">{organizerName}</p>
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

              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-neutral-200">
                  {t.capacity}: {event.maxSeats} {t.seats}
                </span>
              </div>
            </div>

            <div className="bg-neutral-950/70 border border-white/15 rounded-3xl p-7 lg:p-8 backdrop-blur-xl shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
              <h3 className="text-2xl font-black text-neutral-50 tracking-wide mb-6">{t.registration}</h3>

              {event.tickets && event.tickets.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {(event.tickets as Ticket[]).map((ticket) => (
                    <div key={ticket.categoryTicketId} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-white truncate">{ticket.name}</p>
                        {ticket.description && <p className="text-xs text-neutral-400 mt-0.5 line-clamp-1">{ticket.description}</p>}
                      </div>
                      <p className="text-lg font-black text-neutral-50 whitespace-nowrap">
                        {ticket.price > 0 ? `${ticket.price.toLocaleString('vi-VN')} đ` : 'Free'}
                      </p>
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
                  onClick={() => navigate(`/events/${eventId}/payment`)}
                >
                  {t.register}
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
                    <p className="text-xs font-black uppercase text-neutral-300 tracking-wider">{t.organizedBy}</p>
                    <h4 className="text-xl font-bold text-neutral-100">{event.speakerName}</h4>
                  </div>
                </div>
                {event.speakerBio && <p className="text-sm text-neutral-200 leading-relaxed">{event.speakerBio}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
