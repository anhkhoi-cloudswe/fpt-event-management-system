import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { EventListItem } from '../../types/event'

interface EventCalendarProps {
  events: EventListItem[]
  onEventClick?: (event: EventListItem) => void
}

export function EventCalendar({ events, onEventClick }: EventCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDayEvents, setSelectedDayEvents] = useState<EventListItem[] | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  // Month names
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ]

  // Day names
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Show all events for a specific day
  const handleShowAllEvents = (day: number, dayEvents: EventListItem[]) => {
    setSelectedDay(day)
    setSelectedDayEvents(dayEvents)
  }

  const handleCloseModal = () => {
    setSelectedDay(null)
    setSelectedDayEvents(null)
  }

  // Get events for a specific day
  const getEventsForDay = (day: number) => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime)
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === month &&
        eventDate.getFullYear() === year
      )
    })
  }

  // Check if a day is today
  const isToday = (day: number) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  // Generate calendar days
  const calendarDays = []

  // Previous month's trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      events: []
    })
  }

  // Current month's days
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({
      day,
      isCurrentMonth: true,
      events: getEventsForDay(day)
    })
  }

  // Next month's leading days - only fill to complete the last week
  const totalDays = calendarDays.length
  const rowsNeeded = Math.ceil(totalDays / 7)
  const targetDays = rowsNeeded * 7
  const remainingDays = targetDays - calendarDays.length

  for (let day = 1; day <= remainingDays; day++) {
    calendarDays.push({
      day,
      isCurrentMonth: false,
      events: []
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {monthNames[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
          >
            Hôm nay
          </button>
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {dayNames.map(day => (
          <div
            key={day}
            className="text-center text-sm font-semibold text-gray-600 py-2"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((dayInfo, index) => {
          const { day, isCurrentMonth, events: dayEvents } = dayInfo
          const today = isToday(day) && isCurrentMonth
          // Only check hasEvents for current month days
          const hasEvents = isCurrentMonth && dayEvents.length > 0

          return (
            <div
              key={index}
              className={`min-h-[100px] border border-gray-200 p-2 ${!isCurrentMonth
                  ? 'bg-gray-50 opacity-50'
                  : hasEvents
                    ? 'bg-gray-100'
                    : 'bg-white'
                } ${today ? 'ring-2 ring-blue-500' : ''}`}
            >
              {/* Day number */}
              <div
                className={`text-sm font-semibold mb-1 ${!isCurrentMonth
                    ? 'text-gray-400'
                    : today
                      ? 'text-blue-600'
                      : 'text-gray-900'
                  }`}
              >
                {day}
              </div>

              {/* Events - only show for current month */}
              {isCurrentMonth && hasEvents && (
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map(event => (
                    <button
                      key={event.eventId}
                      onClick={() => onEventClick?.(event)}
                      className="w-full text-left rounded overflow-hidden transition-all hover:ring-2 hover:ring-blue-400"
                      title={event.title}
                    >
                      {event.bannerUrl ? (
                        <div className="relative">
                          <img
                            src={event.bannerUrl}
                            alt={event.title}
                            className="w-full h-16 object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                            <p className="text-xs text-white font-medium truncate">
                              {event.title}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded text-xs text-blue-800 truncate">
                          {event.title}
                        </div>
                      )}
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleShowAllEvents(day, dayEvents)
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 hover:bg-blue-50 rounded transition-colors w-full text-left"
                    >
                      +{dayEvents.length - 2} sự kiện
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* All Events Modal */}
      {selectedDayEvents && selectedDay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                Sự kiện ngày {selectedDay} {monthNames[month]} {year}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              <div className="space-y-3">
                {selectedDayEvents.map(event => (
                  <button
                    key={event.eventId}
                    onClick={() => {
                      onEventClick?.(event)
                      handleCloseModal()
                    }}
                    className="w-full text-left border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-blue-400 transition-all"
                  >
                    <div className="flex gap-3 p-3">
                      {event.bannerUrl ? (
                        <img
                          src={event.bannerUrl}
                          alt={event.title}
                          className="w-24 h-24 object-cover rounded"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-blue-100 rounded flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">Sự kiện</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                          {event.title}
                        </h4>
                        <p className="text-sm text-gray-600 mb-1 line-clamp-2">
                          {event.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>
                            {new Date(event.startTime).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {event.venueLocation && (
                            <>
                              <span>•</span>
                              <span className="truncate">{event.venueLocation}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 rounded"></div>
          <span>Hôm nay</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-100 rounded"></div>
          <span>Có sự kiện</span>
        </div>
      </div>
    </div>
  )
}
