import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Copy, ExternalLink, MapPin, Users, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { EventDetail } from '../../types/event'
import { getCleanedLocationForMap } from '../../utils/location'

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
  onlineMeetingId?: string | null
  onlineMeetingSecret?: string | null
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

const cleanLocationToken = (value?: string | null) => {
  const trimmed = (value || '').trim()
  if (!trimmed || /^null$/i.test(trimmed) || /^undefined$/i.test(trimmed)) return ''
  if (/^https?:\/\//i.test(trimmed)) return ''
  return trimmed
}

const buildGoogleMapsEmbedUrl = (tokens: Array<string | null | undefined>) => {
  const query = tokens
    .map(cleanLocationToken)
    .filter(Boolean)
    .filter((value, index, arr) => arr.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .join(', ')

  return `https://maps.google.com/maps?q=${encodeURIComponent(query || 'FPT University Ho Chi Minh City, Vietnam')}&t=&z=16&ie=UTF-8&iwloc=&output=embed`
}

const getCalendarParts = (value: string | undefined, lang: 'vi' | 'en') => {
  if (!value) return { month: '---', day: '--' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { month: '---', day: '--' }
  
  let month = date.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', { month: 'short' })
  if (lang === 'vi') {
    month = month.replace(/tháng/i, 'THG').replace(/thg/i, 'THG').replace('.', '').trim().toUpperCase()
  } else {
    month = month.toUpperCase()
  }
  const day = date.getDate().toString()
  return { month, day }
}

const getOnlinePlatformLabel = (onlineMeetingUrl?: string | null) => (
  onlineMeetingUrl && /zoom\.us/i.test(onlineMeetingUrl) ? 'Zoom' : 'Google Meet'
)

const buildLocationRows = ({
  eventFormat,
  venueName,
  areaName,
  floor,
  exactLocationString,
  onlinePlatformLabel,
  areaLabel,
  floorLabel,
}: {
  eventFormat: string
  venueName: string
  areaName: string
  floor: string
  exactLocationString: string
  onlinePlatformLabel: string
  areaLabel: string
  floorLabel: string
}) => {
  if (eventFormat === 'ONLINE') return [onlinePlatformLabel]

  if (eventFormat === 'HYBRID') {
    return [
      `Online: ${onlinePlatformLabel}`,
      venueName ? `Onsite: ${venueName}` : '',
      areaName ? `${areaLabel}: ${areaName}` : '',
      floor ? `${floorLabel} ${floor}` : '',
      exactLocationString && exactLocationString !== venueName ? exactLocationString : '',
    ].filter(Boolean)
  }

  return [
    venueName,
    areaName ? `${areaLabel}: ${areaName}` : '',
    floor ? `${floorLabel} ${floor}` : '',
    exactLocationString,
  ].filter(Boolean)
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
  const { currentLanguage, user } = useAuth()
  const activeRole = userRole || user?.role
  const [copied, setCopied] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [checkingRegistration, setCheckingRegistration] = useState(false)

  const lang: 'vi' | 'en' = currentLanguage === 'en' ? 'en' : 'vi'
  const text = {
    loading: lang === 'en' ? 'Loading event details...' : 'Đang tải chi tiết...',
    error: lang === 'en' ? 'Error' : 'Lỗi',
    copied: lang === 'en' ? 'Copied' : 'Đã sao chép',
    copyLink: lang === 'en' ? 'Copy Link' : 'Sao chép liên kết',
    eventPage: lang === 'en' ? 'Event Page' : 'Trang sự kiện',
    fullSize: lang === 'en' ? 'View full size' : 'Xem ảnh lớn',
    area: lang === 'en' ? 'Area' : 'Khu vực',
    floor: lang === 'en' ? 'Floor' : 'Tầng',
    capacity: lang === 'en' ? 'Capacity' : 'Sức chứa',
    seats: lang === 'en' ? 'seats' : 'chỗ',
    registered: lang === 'en' ? 'Registered' : 'Đã đăng ký',
    people: lang === 'en' ? 'people' : 'người',
    hostedBy: lang === 'en' ? 'Hosted By' : 'Tổ chức bởi',
    speakers: lang === 'en' ? 'Speakers' : 'Diễn giả',
    about: lang === 'en' ? 'About the Event' : 'Mô tả sự kiện',
    location: lang === 'en' ? 'Location' : 'Địa điểm',
    free: lang === 'en' ? 'Free' : 'Miễn phí',
    register: lang === 'en' ? 'Register Now' : 'Đăng ký ngay',
    tickets: lang === 'en' ? 'Tickets' : 'Hạng vé',
    updateInfo: lang === 'en' ? 'Update info' : 'Cập nhật thông tin',
    organizerFallback: lang === 'en' ? 'FPT Organizer' : 'Ban tổ chức FPT',
    detailMap: lang === 'en' ? 'event banner' : 'ảnh sự kiện',
    ended: lang === 'en' ? 'Event Ended' : 'Sự kiện đã kết thúc',
    closed: lang === 'en' ? 'Registration Closed' : 'Đăng ký đã đóng',
    attendanceQr: lang === 'en' ? 'Attendance QR' : 'Ma QR diem danh',
    attendanceHint: lang === 'en'
      ? 'Share this QR near the end of the Zoom/Meet session. Only registered students can confirm attendance.'
      : 'Chia se QR nay vao cuoi buoi Zoom/Meet. Chi sinh vien da dang ky moi xac nhan duoc.',
  }

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const detail = event as EventDetailExtras | null
  const eventId = detail?.eventId || detail?.id || 0

  useEffect(() => {
    if (isOpen && eventId && user && activeRole === 'STUDENT') {
      const checkRegistration = async () => {
        setCheckingRegistration(true)
        try {
          const res = await fetch('/api/registrations/my-tickets?page=1&limit=100', {
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          })
          if (res.ok) {
            const data = await res.json()
            const tickets = data.tickets || []
            const registered = tickets.some((t: any) => t.eventId === eventId)
            setIsRegistered(registered)
          }
        } catch (err) {
          console.error('Error checking registration status:', err)
        } finally {
          setCheckingRegistration(false)
        }
      }
      checkRegistration()
    } else {
      setIsRegistered(false)
    }
  }, [isOpen, eventId, user, activeRole])

  if (!isOpen) return null

  const eventClosed = detail?.status !== 'OPEN'
  const eventEnded = detail ? new Date(detail.endTime).getTime() < Date.now() : false
  const eventPagePath = detail?.eventPagePath || `/events/${eventId}/page`
  const eventPaymentPath = detail?.eventPaymentPath || `/events/${eventId}/payment`
  const eventFormat = (detail?.eventFormat || '').toUpperCase()
  const organizerId = detail?.organizerId ?? detail?.organizer_id
  const canShowAttendanceQr = activeRole === 'ORGANIZER' && user?.id === organizerId && detail?.status === 'OPEN' && (eventFormat === 'ONLINE' || eventFormat === 'HYBRID')
  const attendanceUrl = `${window.location.origin}/attendance/confirm?eventId=${eventId}&action=checkout`
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
  const customVenueName = cleanLocationToken(detail?.customVenueName)
  const customLocation = cleanLocationToken(detail?.customLocation)
  const venueName = customVenueName || detail?.venueName || detail?.venue?.venueName || detail?.venueArea?.venue?.venueName || ''
  const exactLocationString =
    customLocation ||
    detail?.venueLocation ||
    detail?.location ||
    detail?.venueArea?.venue?.location ||
    detail?.venue?.location ||
    ''
  const onlinePlatformLabel = getOnlinePlatformLabel(detail?.onlineMeetingUrl)
  const cleanedMapLocation = getCleanedLocationForMap(exactLocationString, venueName)
  const mapTokens = [
    cleanedMapLocation,

    /viet nam|vietnam|ho chi minh|hcm|sai gon|saigon/i.test(cleanedMapLocation) ? '' : 'Ho Chi Minh City, Vietnam',
  ]
  const locationRows = buildLocationRows({
    eventFormat,
    venueName,
    areaName,
    floor,
    exactLocationString,
    onlinePlatformLabel,
    areaLabel: text.area,
    floorLabel: text.floor,
  })
  const mapSrc = buildGoogleMapsEmbedUrl(mapTokens)
  const speakers = (detail?.speakers ?? []).filter((speaker) => getSpeakerName(speaker))
  const fallbackSpeaker = detail?.speakerName
    ? [{ name: detail.speakerName, avatarUrl: detail.speakerAvatarUrl || '' }]
    : []
  const speakersToDisplay = speakers.length > 0 ? speakers : fallbackSpeaker
  const { month: calMonth, day: calDay } = getCalendarParts(detail?.startTime, lang)

  const closeThenNavigate = (path: string) => {
    onClose()
    setTimeout(() => {
      navigate(path)
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
        onClick={onClose}
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
              onClick={() => closeThenNavigate(eventPagePath)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {text.eventPage}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
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

                <div className="flex items-center gap-3 mt-3 mb-6">
                  {organizerAvatar ? (
                    <img src={organizerAvatar} alt={organizerName} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-sm font-bold shadow-sm select-none">
                      {organizerInitial}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">{text.hostedBy}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{organizerName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-[#1e1e24] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col items-center justify-between flex-shrink-0 shadow-sm">
                      <div className="w-full bg-slate-200 dark:bg-white/10 py-0.5 text-center text-[8px] font-black tracking-wider text-slate-600 dark:text-neutral-300 uppercase leading-none">
                        {calMonth}
                      </div>
                      <div className="w-full flex-1 flex items-center justify-center text-sm font-black text-blue-600 dark:text-blue-400 leading-none pb-0.5">
                        {calDay}
                      </div>
                    </div>
                    <div className="text-sm">
                      <p className="text-slate-900 dark:text-white font-semibold">{formatDate(detail.startTime, lang)}</p>
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

              {canShowAttendanceQr && (
                <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <QRCodeSVG value={attendanceUrl} size={128} level="H" includeMargin />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black uppercase tracking-wide text-blue-900 dark:text-blue-100">{text.attendanceQr}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-blue-800 dark:text-blue-100/80">{text.attendanceHint}</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(attendanceUrl)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-100 dark:hover:bg-blue-500/20"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {text.copyLink}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {detail.tickets && detail.tickets.length > 0 && (
                <section className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-5">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">{text.tickets}</h2>
                  <div className="divide-y divide-slate-200 dark:divide-white/10">
                    {detail.tickets.map((ticket) => (
                        <div key={ticket.categoryTicketId} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ticket.name}</p>
                          {ticket.description && (
                            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 line-clamp-1">{ticket.description}</p>
                          )}
                        </div>
                        <p className="text-sm font-black text-slate-950 dark:text-white whitespace-nowrap">
                          {ticket.price > 0 ? `${ticket.price.toLocaleString('vi-VN')} đ` : text.free}
                        </p>
                        </div>
                    ))}
                  </div>
                  {eventClosed || eventEnded ? (
                    <button
                      type="button"
                      disabled
                      className="w-full bg-slate-200 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border border-slate-300 dark:border-neutral-700 font-bold py-3.5 rounded-xl mt-6 transition-all uppercase tracking-wide cursor-not-allowed"
                    >
                      {eventEnded ? text.ended : text.closed}
                    </button>
                  ) : activeRole && activeRole !== 'STUDENT' ? (
                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        disabled
                        className="w-full bg-slate-100 dark:bg-neutral-900/50 text-slate-400 dark:text-neutral-500 border border-slate-200 dark:border-white/5 font-semibold py-3 rounded-xl transition-all uppercase tracking-wide cursor-not-allowed text-xs"
                      >
                        {lang === 'en' ? 'Staff/Organizer accounts cannot buy tickets' : 'Tài khoản BTC/Nhân sự không thể đặt vé'}
                      </button>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 mt-2 font-medium">
                        {lang === 'en' 
                          ? '* Please use a Student account to register for events.' 
                          : '* Vui lòng đăng nhập tài khoản Sinh viên để mua vé tham gia.'}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => closeThenNavigate(eventPaymentPath)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl mt-6 transition-all uppercase tracking-wide"
                    >
                      {text.register}
                    </button>
                  )}
                </section>
              )}

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

              {(eventFormat === 'ONLINE' || eventFormat === 'HYBRID') && (user?.id === organizerId || isRegistered) && (
                <section className="space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">
                    {lang === 'en' ? 'Online Meeting Info' : 'Thông tin phòng họp trực tuyến'}
                  </h2>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-500/20 dark:bg-blue-950/20 space-y-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {lang === 'en' ? 'Online Platform' : 'Nền tảng trực tuyến'}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-neutral-300 mt-1">
                          {onlinePlatformLabel}
                        </p>
                      </div>
                    </div>

                    {detail.onlineMeetingUrl && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wide">
                          {lang === 'en' ? 'Meeting URL' : 'Đường dẫn cuộc họp'}
                        </p>
                        <div className="flex items-center gap-2">
                          <a
                            href={detail.onlineMeetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            {detail.onlineMeetingUrl}
                          </a>
                        </div>
                      </div>
                    )}

                    {detail.onlineMeetingId && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wide">
                          Meeting ID
                        </p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-neutral-200">
                          {detail.onlineMeetingId}
                        </p>
                      </div>
                    )}

                    {detail.onlineMeetingSecret && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-wide">
                          {lang === 'en' ? 'Passcode' : 'Mật khẩu cuộc họp'}
                        </p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-neutral-200 font-mono">
                          {detail.onlineMeetingSecret}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-neutral-500">{text.location}</h2>
                <div className="flex items-start gap-3 text-sm leading-relaxed">
                  <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {locationRows.map((row) => (
                      <p key={row} className="text-slate-700 dark:text-neutral-300 first:font-medium first:text-slate-900 first:dark:text-white">{row}</p>
                    ))}
                  </div>
                </div>
                {eventFormat !== 'ONLINE' && (
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
                )}
              </section>
            </>
          )}
        </div>

        {!loading && !error && detail && userRole === 'ORGANIZER' && detail.status === 'APPROVED' && onEdit && (
          <div className="border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-neutral-950/90 p-4">
            <button
              onClick={onEdit}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              {text.updateInfo}
            </button>
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
