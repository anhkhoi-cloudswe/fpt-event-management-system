import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Copy, ExternalLink, MapPin, Users, X } from 'lucide-react'
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
    viewDetails: lang === 'en' ? 'View Details' : 'Xem chi tiet',
    fullSize: lang === 'en' ? 'View full size' : 'Xem kich thuoc day du',
    area: lang === 'en' ? 'Area' : 'Khu vuc',
    floor: lang === 'en' ? 'Floor' : 'Tang',
    capacity: lang === 'en' ? 'Capacity' : 'Suc chua',
    seats: lang === 'en' ? 'seats' : 'cho',
    registered: lang === 'en' ? 'Registered' : 'Da dang ky',
    people: lang === 'en' ? 'people' : 'nguoi',
    updateInfo: lang === 'en' ? 'Update info' : 'Cap nhat thong tin',
    close: lang === 'en' ? 'Close' : 'Dong',
    detailMap: lang === 'en' ? 'event banner' : 'anh su kien',
  }

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const eventId = event?.eventId || (event as any)?.id || 0
  const locationDetail = [
    event?.areaName ? `${text.area}: ${event.areaName}` : '',
    event?.floor ? `${text.floor} ${event.floor}` : '',
  ].filter(Boolean).join(' · ')

  const handleClose = () => {
    onClose()
  }

  const handleEventPage = () => {
    navigate(`/events/${eventId}/page`)
    onClose()
  }

  const handleCopyLink = () => {
    if (!event) return
    navigator.clipboard.writeText(`${window.location.origin}/events/${eventId}/page`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl flex flex-col h-full z-10 animate-slide-in-right border-l border-gray-200 dark:border-slate-800">
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
              onClick={handleEventPage}
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

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && <p className="text-gray-500 text-center py-4">{text.loading}</p>}

          {error && (
            <p className="text-red-500 text-center py-4">
              {text.error}: {error}
            </p>
          )}

          {!loading && !error && event && (
            <>
              {event.bannerUrl && (
                <button
                  type="button"
                  onClick={() => setIsZoomed(true)}
                  className="block w-full rounded-xl overflow-hidden shadow-sm aspect-video relative group cursor-zoom-in bg-slate-100 dark:bg-slate-800 border dark:border-slate-850"
                >
                  <img
                    src={event.bannerUrl}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    {text.fullSize}
                  </span>
                </button>
              )}

              <div className="space-y-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                  {event.title}
                </h2>

                <div className="grid grid-cols-1 gap-3">
                  <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                    <Calendar className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <p className="text-slate-700 dark:text-slate-100 font-medium">
                        {formatDate(event.startTime, lang)}
                      </p>
                      <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">
                        {formatTimeRange(event.startTime, event.endTime, lang)}
                      </p>
                    </div>
                  </div>

                  {(event.venueName || event.location || locationDetail) && (
                    <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                      <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        {event.venueName && (
                          <p className="text-slate-700 dark:text-slate-100 font-medium">{event.venueName}</p>
                        )}
                        {locationDetail && (
                          <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">{locationDetail}</p>
                        )}
                        {event.location && (
                          <p className="text-slate-700 dark:text-slate-100 font-medium mt-0.5">{event.location}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 items-start p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-transparent dark:border-slate-700/50 shadow-sm">
                    <Users className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
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
            </>
          )}
        </div>

        {!loading && !error && event && (
          <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-850 p-4 flex-shrink-0">
            <div className="flex gap-2">
              {userRole === 'ORGANIZER' && event.status === 'APPROVED' && onEdit && (
                <button
                  onClick={onEdit}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {text.updateInfo}
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                {text.close}
              </button>

              <button
                type="button"
                onClick={handleEventPage}
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
              >
                {text.viewDetails} / {text.eventPage}
              </button>
            </div>
          </div>
        )}
      </div>

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
    document.body,
  )
}
