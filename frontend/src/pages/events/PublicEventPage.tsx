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

type SpeakerLike = {
  name?: string | null
  speakerName?: string | null
  fullName?: string | null
  avatar?: string | null
  avatarUrl?: string | null
  speakerAvatarUrl?: string | null
  speakerBio?: string | null
  bio?: string | null
}

type EventDetailExtras = EventDetail & {
  id?: number
  organizer_id?: number
  organizerAvatar?: string | null
  organizerAvatarUrl?: string | null
  organizer_avatar?: string | null
  organizer_avatar_url?: string | null
  bannerImg?: string | null
  speakers?: SpeakerLike[] | null
  venueLocation?: string | null
  area_name?: string | null
  venue?: {
    location?: string | null
    venueName?: string | null
  } | null
  venueArea?: {
    areaName?: string | null
    area_name?: string | null
    floor?: string | null
    venue?: {
      location?: string | null
      venueName?: string | null
    } | null
  } | null
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
  const pageLanguage: 'vi' | 'en' = currentLanguage
  const t = {
    loading: pageLanguage === 'en' ? 'Loading event page...' : 'Đang tải trang sự kiện...',
    error: pageLanguage === 'en' ? 'Error' : 'Lỗi',
    notFound: pageLanguage === 'en' ? 'Event not found' : 'Không tìm thấy sự kiện',
    back: pageLanguage === 'en' ? 'Back' : 'Quay lại',
    organizedBy: pageLanguage === 'en' ? 'Organized by' : 'Tổ chức bởi',
    defaultLocation: pageLanguage === 'en' ? 'FPT location' : 'Địa điểm FPT',
    area: pageLanguage === 'en' ? 'Area' : 'Khu vực',
    floor: pageLanguage === 'en' ? 'Floor' : 'Tầng',
    registration: pageLanguage === 'en' ? 'Registration' : 'Đăng ký tham gia',
    capacity: pageLanguage === 'en' ? 'Capacity' : 'Sức chứa',
    seats: pageLanguage === 'en' ? 'seats' : 'chỗ',
    about: pageLanguage === 'en' ? 'About Event' : 'Mô tả sự kiện',
    noTicket: pageLanguage === 'en' ? 'No matching ticket type found' : 'Không tìm thấy loại vé phù hợp',
    organizerFallback: pageLanguage === 'en' ? 'FPT Organizer' : 'Ban tổ chức FPT',
    register: pageLanguage === 'en' ? 'Register Now' : 'Đăng ký ngay',
    ended: pageLanguage === 'en' ? 'Event Ended' : 'Sự kiện đã kết thúc',
    closed: pageLanguage === 'en' ? 'Registration Closed' : 'Đăng ký đã đóng',
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
    ''
  const areaName = event.areaName || event.area_name || event.venueArea?.areaName || event.venueArea?.area_name || ''
  const floor = event.floor || event.venueArea?.floor || ''
  const venueName = event.venueName || event.venue?.venueName || event.venueArea?.venue?.venueName || ''
  const exactLocationString =
    event.venueArea?.venue?.location ||
    event.location ||
    event.venueLocation ||
    event.venue?.location ||
    ''
  const locationDisplayString = event.venueArea?.venue?.location || event.location || 'HCMC'
  const mapLocationString = [
    venueName,
    exactLocationString !== venueName ? exactLocationString : '',
    exactLocationString === '' && locationDisplayString !== venueName ? locationDisplayString : ''
  ].filter((val) => val && val.trim() !== '').join(', ') || 'FPT University HCMC'
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(mapLocationString)}&t=&z=15&ie=UTF-8&iwloc=&output=embed`

  const getSpeakerName = (speaker: SpeakerLike) => (
    speaker.name ||
    speaker.speakerName ||
    speaker.fullName ||
    ''
  ).trim()

  const getSpeakerAvatar = (speaker: SpeakerLike) => (
    speaker.avatar ||
    speaker.avatarUrl ||
    speaker.speakerAvatarUrl ||
    ''
  ).trim()

  const speakers: SpeakerLike[] = (event.speakers ?? []).filter((s) => getSpeakerName(s))
  const fallbackSpeaker: SpeakerLike[] = event.speakerName
    ? [{ name: event.speakerName, avatarUrl: event.speakerAvatarUrl || '', bio: event.speakerBio || '' }]
    : []
  const speakersToDisplay = speakers.length > 0 ? speakers : fallbackSpeaker

  const locationTitle = venueName || event.location || t.defaultLocation
  const locationDetail = [
    areaName ? `${t.area}: ${areaName}` : '',
    floor ? `${t.floor} ${floor}` : '',
  ].filter(Boolean).join(' · ')
  const eventClosed = event.status !== 'OPEN' || (event as any).isClosed === true
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
        <div className="max-w-[1380px] mx-auto w-full px-6 sm:px-10 pt-5">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-neutral-100 px-4 py-2 rounded-lg font-black tracking-wide transition-all uppercase mb-5"
          >
            <span aria-hidden="true">←</span> {t.back}
          </button>
        </div>

        <div className="max-w-[1380px] mx-auto w-full px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <div className="aspect-video rounded-2xl overflow-hidden bg-black/20 border border-white/10 shadow-[0_18px_52px_rgba(0,0,0,0.4)]">
              {event.bannerUrl ? (
                <img src={event.bannerUrl} alt={event.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-4xl">Image</div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-4 mb-6">
              {organizerAvatar ? (
                <img src={organizerAvatar} className="w-10 h-10 rounded-full border border-white/10 object-cover" alt={organizerName} />
              ) : (
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm select-none"
                  style={{ background: 'linear-gradient(135deg, #f97316, #d97706)' }}
                >
                  {organizerName ? organizerName.charAt(0).toUpperCase() : 'F'}
                </div>
              )}
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

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-neutral-100 text-sm font-black leading-tight">{formatDate(event.startTime, pageLanguage)}</p>
                  <p className="text-neutral-450 text-xs mt-0.5">{formatTimeRange(event.startTime, event.endTime, pageLanguage)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl text-blue-400 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-neutral-100 text-sm font-black leading-tight">{locationTitle}</p>
                  {locationDetail && <p className="text-neutral-450 text-xs mt-0.5">{locationDetail}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-neutral-100 text-sm font-black leading-tight">
                    {t.capacity}: {event.maxSeats} {t.seats}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-neutral-950/70 border border-white/15 rounded-3xl p-7 lg:p-8 backdrop-blur-xl shadow-[0_24px_70px_rgba(0,0,0,0.42)] space-y-5">
              <h3 className="text-2xl font-black text-neutral-50 tracking-wide mb-6">{t.registration}</h3>

              {event.tickets && event.tickets.length > 0 ? (
                <div className="space-y-3.5">
                  {(event.tickets as Ticket[]).map((ticket) => (
                    <div key={ticket.categoryTicketId} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm">
                      <div className="min-w-0">
                        <p className="text-base font-black text-neutral-100 truncate">{ticket.name}</p>
                        {ticket.description ? (
                          <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">{ticket.description}</p>
                        ) : (
                          <p className="text-xs text-neutral-500 mt-1 italic">{pageLanguage === 'en' ? 'Standard ticket type' : 'Hạng vé tiêu chuẩn'}</p>
                        )}
                      </div>
                      <p className="text-lg font-black text-blue-400 whitespace-nowrap">
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
                  {eventEnded ? t.ended : t.closed}
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

        <div className="max-w-[1380px] mx-auto w-full px-6 sm:px-10 mt-10 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Cột trái: Giữ trống để lệch bố cục sang phải như nguyên bản */}
          <div className="hidden lg:block"></div>

          {/* Cột phải: Diễn giả -> Về Sự kiện -> Địa điểm */}
          <div className="space-y-6">
            {speakersToDisplay.length > 0 && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-neutral-300">
                  {pageLanguage === 'en' ? 'Speakers' : 'Diễn giả'}
                </h3>
                <div className="space-y-4 divide-y divide-white/10">
                  {speakersToDisplay.map((speaker, idx) => {
                    const name = getSpeakerName(speaker)
                    const avatar = getSpeakerAvatar(speaker)
                    const bio = speaker.bio || speaker.speakerBio || ''
                    return (
                      <div key={name + '-' + idx} className="pt-4 first:pt-0 space-y-3">
                        <div className="flex items-center gap-4">
                          {avatar ? (
                            <img src={avatar} alt={name} className="w-14 h-14 rounded-full object-cover border border-white/10 shadow-md" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl border border-neutral-700 font-bold">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h4 className="text-lg font-bold text-neutral-100">{name}</h4>
                            <p className="text-xs text-neutral-400 font-medium">{pageLanguage === 'en' ? 'Speaker' : 'Diễn giả khách mời'}</p>
                          </div>
                        </div>
                        {bio && <p className="text-sm text-neutral-300 leading-relaxed">{bio}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {event.description && (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-neutral-300">{t.about}</h3>
                <div className="text-neutral-100 text-base leading-relaxed antialiased font-medium whitespace-pre-wrap max-w-none">
                  {event.description}
                </div>
              </div>
            )}

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-neutral-300">
                {pageLanguage === 'en' ? 'Location' : 'Địa điểm'}
              </h3>
              <div className="flex items-start gap-3 text-sm leading-relaxed text-neutral-200">
                <MapPin className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  {venueName && <p className="font-bold text-neutral-100 text-lg leading-tight">{venueName}</p>}
                  {areaName && <p className="text-neutral-300 mt-1">{pageLanguage === 'en' ? 'Area' : 'Khu vực'}: {areaName}</p>}
                  {floor && <p className="text-neutral-300 mt-1">{pageLanguage === 'en' ? 'Floor' : 'Tầng'} {floor}</p>}
                  <p className="text-neutral-400 mt-1">{locationDisplayString}</p>
                </div>
              </div>
              <iframe
                title="Event Location Map"
                width="100%"
                height="220"
                style={{ border: 0, borderRadius: '12px' }}
                src={mapSrc}
                allowFullScreen
                loading="lazy"
                className="mt-2 border border-white/10 shadow-inner"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
