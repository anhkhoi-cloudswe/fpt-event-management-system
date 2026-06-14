import { describe, expect, it } from 'vitest'
import {
  compareTimeStringsForEventStatus,
  extractDateFromRFC3339,
  extractTimeFromRFC3339,
  formatVietnamDateTime,
  formatWallClockDateTimeSimple,
  formatWallClockDateTimeWithDayOfWeek,
  formatWallClockTimeFromRFC3339,
} from '../dateFormat'

describe('date formatting utilities', () => {
  const eventTime = '2026-04-18T14:30:45+07:00'

  it('formats RFC3339 strings without shifting wall-clock time', () => {
    expect(formatVietnamDateTime(eventTime)).toBe('18/04/2026 14:30:45')
    expect(formatVietnamDateTime(eventTime, 'dd/MM/yyyy HH:mm')).toBe('18/04/2026 14:30')
    expect(formatWallClockDateTimeSimple(eventTime)).toBe('18/04/2026 14:30')
    expect(formatWallClockTimeFromRFC3339(eventTime)).toBe('18/04/2026 14:30')
  })

  it('extracts date and time components from RFC3339 strings', () => {
    expect(extractDateFromRFC3339(eventTime)).toBe('2026-04-18')
    expect(extractTimeFromRFC3339(eventTime)).toBe('14:30')
    expect(extractDateFromRFC3339('bad')).toBe('')
    expect(extractTimeFromRFC3339('bad')).toBe('')
  })

  it('includes the Vietnamese day of week', () => {
    expect(formatWallClockDateTimeWithDayOfWeek(eventTime)).toBe('18/04/2026 • Thứ Bảy • 14:30')
  })

  it('compares event status windows', () => {
    expect(compareTimeStringsForEventStatus(
      '2026-04-18T15:00:00+07:00',
      '2026-04-18T14:30:00+07:00',
      '2026-04-18T16:00:00+07:00',
    )).toEqual({ eventOngoing: true, eventEnded: false })

    expect(compareTimeStringsForEventStatus(
      '2026-04-18T16:00:00+07:00',
      '2026-04-18T14:30:00+07:00',
      '2026-04-18T16:00:00+07:00',
    )).toEqual({ eventOngoing: false, eventEnded: true })
  })
})
