import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Armchair, Calendar, Copy, ExternalLink, MapPin, Users, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { EventDetail } from '../../types/event'

interface EventDetailModalProps {
  isOpen: boolean
  onClose: () => void
  event: EventDetail | null
  loading: boolean
  error: string | null
  userRole?: string
  onEdit?: () => void
}

type SpeakerLike = {
  name?: string | null
  speakerName?: string | null
  fullName?: string | null
  avatar?: string | null
  avatarUrl?: string | null
  speakerAvatarUrl?: string | null
}

type EventDetailExtras = EventDetail & {
  id?: number
  organizer_id?: number
  organizerAvatar?: string | null
  organizerAvatarUrl?: string | null
  organizer_avatar?: string | null
  organizer_avatar_url?: string | null
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
  const { currentLanguage } = useAuth()
  const [copied, setCopied] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)

  const lang: 'vi' | 'en' = currentLanguage === 'en' ? 'en' : 'vi'
  const text = {
    loading: lang === 'en' ? 'Loading event details...' : 'Dang tai chi tiet...',
    error: lang === 'en' ? 'Error' : 'Loi',
    copied: lang === 'en' ? 'Copied' : 'Da copy',
    copyLink: lang === 'en' ? 'Copy Link' : 'Copy Link',
    eventPage: lang === 'en' ? 'Event Page' : 'Trang su kien',
    fullSize: lang === 'en' ? 'View full size' : 'Xem kich thuoc day du',
    area: lang === 'en' ? 'Area' : 'Khu vuc',
    floor: lang === 'en' ? 'Floor' : 'Tang',
    capacity: lang === 'en' ? 'Capacity' : 'Suc chua',
    seats: lang === 'en' ? 'seats' : 'cho',
    registered: lang === 'en' ? 'Registered' : 'Da dang ky',
    people: lang === 'en' ? 'people' : 'nguoi',
    hostedBy: lang === 'en' ? 'Hosted By' : 'To chuc boi',
    speakers: lang === 'en' ? 'Speakers' : 'Dien gia',
    about: lang === 'en' ? 'About the Event' : 'Mo ta su kien',
    location: lang === 'en' ? 'Location' : 'Dia diem',
    from: lang === 'en' ? 'From' : 'Tu',
    free: lang === 'en' ? 'Free' : 'Mien phi',
    register: lang === 'en' ? 'Get Tickets / Register Now' : 'Lay ve / Dang ky ngay',
    updateInfo: lang === 'en' ? 'Update info' : 'Cap nhat thong tin',
    organizerFallback: lang === 'en' ? 'Event Organizer' : 'Nguoi to chuc su kien',
    detailMap: lang === 'en' ? 'event banner' : 'anh su kien',
  }

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const detail = event as EventDetailExtras | null
  const eventId = detail?.eventId || detail?.id || 0
  const eventPagePath = `/events/${eventId}/page`
  const organizerId = detail?.organizerId ?? detail?.organizer_id
  const organizerName = detail?.organizerName || (organizerId ? `${text.organizerFallback} #${organizerId}` : text.organizerFallback)
  const organizerAvatar =
    detail?.organizerAvatar ||
    detail?.organizerAvatarUrl ||
    detail?.organizer_avatar ||
    detail?.organizer_avatar_url ||
    ''
  const organizerInitial = organizerName.trim().charAt(0).toUpperCase() || 'F'
  const areaName = detail?.areaName || detail?.area_name || detail?.venueArea?.areaName || detail?.venueArea?.area_name || ''
  const floor = detail?.floor || detail?.venueArea?.floor || ''
  const venueName = detail?.venueName || detail?.venue?.venueName || detail?.venueArea?.venue?.venueName || ''
  const exactLocationString =
    detail?.venueArea?.venue?.location ||
    detail?.location ||
    detail?.venueLocation ||
    detail?.venue?.location ||
    ''
  const locationDisplayString = detail?.venueArea?.venue?.location || detail?.location || 'HCMC'
  const mapLocationString = detail?.venueArea?.venue?.location || detail?.location || 'FPT University HCMC'
  const locationRows = [
    venueName,
    areaName ? `${text.area}: ${areaName}` : '',
    floor ? `${text.floor} ${floor}` : '',
    exactLocationString,
  ].filter(Boolean)
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(mapLocationString)}&t=&z=15&ie=UTF-8&iwloc=&output=embed`
  const speakers = (detail?.speakers ?? []).filter((speaker) => getSpeakerName(speaker))
  const fallbackSpeaker = detail?.speakerName
    ? [{ name: detail.speakerName, avatarUrl: detail.speakerAvatarUrl || '' }]
    : []
  const speakersToDisplay = speakers.length > 0 ? speakers : fallbackSpeaker
  const lowestTicketPrice = detail?.tickets?.length
    ? Math.min(...detail.tickets.map((ticket) => Number(ticket.price) || 0))
    : 0

  const handleClose = () => {
    onClose()
  }

  const handleEventPage = () => {
    onClose()
    setTimeout(() => {
      navigate(eventPagePath)
    }, 50)
  }

  const handleCopyLink = () => {
    if (!detail) return
    navigator.clipboard.writeText(`${window.location.origin}${eventPagePath}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-full justify-end">
      <div
        className="fixed inset-0 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-lg h-full bg-white dark:bg-neutral-950 text-slate-900 dark:text-white shadow-2xl flex flex-col z-10 animate-slide-in-right border-l border-slate-200 dark:border-white/10">
        <div className="sticky top-0 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 px-4 py-3.5 flex items-center justify-between z-20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? text.copied : text.copyLink}
            </button>

            <button
              type="button"
              onClick={handleEventPage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {text.eventPage}
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-neutral-400 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[calc(100vh-120px)] custom-scrollbar">
          {loading && <p className="text-slate-600 dark:text-neutral-400 text-center py-4">{text.loading}</p>}

          {error && (
            <p className="text-red-600 dark:text-red-400 text-center py-4">
              {text.error}: {error}
            </p>
          )}

          {!loading && !error && detail && (
            <>
              {detail.bannerUrl && (
                <button
                  type="button"
                  onClick={() => setIsZoomed(true)}
                  className="block w-full rounded-2xl overflow-hidden aspect-video relative group cursor-zoom-in bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-white/10"
                >
                  <img
                    src={detail.bannerUrl}
                    alt={detail.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    {text.fullSize}
                  </span>
                </button>
              )}

              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                  {detail.title}
                </h1>

                <div className="flex items-center gap-2 mt-3 mb-6">
                  {organizerAvatar ? (
                    <img src={organizerAvatar} alt={organizerName} className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-[11px] font-black text-white">
                      {organizerInitial}
                    </div>
                  )}
                  <span className="text-sm text-slate-600 dark:text-neutral-400">{text.hostedBy}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{organizerName}</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="flex gap-3 items-start">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-slate-900 dark:text-white font-medium">{formatDate(detail.startTime, lang)}</p>
                      <p className="text-slate-600 dark:text-neutral-400 mt-0.5">{formatTimeRange(detail.startTime, detail.endTime, lang)}</p>
                    </div>
                  </div>

                  {locationRows.length > 0 && (
                    <div className="flex gap-3 items-start">
                      <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        {locationRows.slice(0, 3).map((row) => (
                          <p key={row} className="text-slate-600 dark:text-neutral-400 first:text-slate-900 first:dark:text-white first:font-medium mt-0.5 first:mt-0">
                            {row}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 items-start">
                    <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="text-slate-900 dark:text-white font-medium">
                        {text.capacity}: {detail.maxSeats} {text.seats}
                      </p>
                      {detail.currentParticipants != null && (
                        <p className="text-slate-600 dark:text-neutral-400 mt-0.5">
                          {text.registered}: {detail.currentParticipants} {text.people}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {speakersToDisplay.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">{text.speakers}</h2>
                  <div className="flex flex-wrap gap-2">
                    {speakersToDisplay.map((speaker) => {
                      const name = getSpeakerName(speaker)
                      const avatar = getSpeakerAvatar(speaker)
                      return (
                        <div
                          key={`${name}-${avatar}`}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2"
                        >
                          {avatar ? (
                            <img src={avatar} alt={name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-neutral-800 flex items-center justify-center text-[10px] font-black text-slate-700 dark:text-neutral-200">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium text-slate-800 dark:text-neutral-200">{name}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {detail.description && (
                <section className="space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">{text.about}</h2>
                  <p className="text-slate-700 dark:text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">{detail.description}</p>
                </section>
              )}

              <section className="space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">{text.location}</h2>
                  <div className="flex items-start gap-3 text-sm leading-relaxed">
                    <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      {venueName && <p className="font-medium text-slate-900 dark:text-white">{venueName}</p>}
                      {areaName && <p className="text-slate-600 dark:text-neutral-400">{text.area}: {areaName}</p>}
                      {floor && <p className="text-slate-600 dark:text-neutral-400">{text.floor} {floor}</p>}
                      <p className="text-slate-700 dark:text-neutral-300">{locationDisplayString}</p>
                    </div>
                  </div>
                  <iframe
                    title="Event Location Map"
                    width="100%"
                    height="200"
                    style={{ border: 0, borderRadius: '12px' }}
                    src={mapSrc}
                    allowFullScreen
                    loading="lazy"
                    className="mt-2 shadow-inner border border-slate-100 dark:border-neutral-800"
                  />
                </section>
            </>
          )}
        </div>

        {!loading && !error && detail && (
          <div className="sticky bottom-0 left-0 w-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 p-4 flex justify-between items-center gap-4 z-10">
            <div className="grid grid-cols-2 gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 px-3 py-2">
                <Armchair className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-neutral-500">{text.capacity}</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {detail.maxSeats} {text.seats}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end min-w-0 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 px-3 py-2">
                {lowestTicketPrice > 0 ? (
                  <div className="text-right min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-neutral-500">{text.from}</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {lowestTicketPrice.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
                    {lang === 'en' ? 'Free' : 'Mien phi'}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden">
              <p className="text-xs font-semibold text-slate-600 dark:text-neutral-400 truncate">
                {text.capacity}: {detail.maxSeats} {text.seats}
              </p>
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {lowestTicketPrice > 0 ? `${text.from} ${lowestTicketPrice.toLocaleString('vi-VN')} đ` : text.free}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {userRole === 'ORGANIZER' && detail.status === 'APPROVED' && onEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-2.5 bg-green-600 hover:bg-green-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {text.updateInfo}
                </button>
              )}

              <button
                type="button"
                onClick={handleEventPage}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]"
              >
                {text.register}
              </button>
            </div>
          </div>
        )}
      </div>

      {isZoomed && detail?.bannerUrl && (
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
            <img src={detail.bannerUrl} alt={detail.title} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
          <p className="text-slate-300 text-sm mt-3 font-semibold text-center pointer-events-none bg-black/40 px-4 py-1.5 rounded-full">
            {detail.title} - {text.detailMap}
          </p>
        </div>
      )}
    </div>,
    document.body,
  )
}
