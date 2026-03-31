package handler

import (
	"fmt"
	"time"

	"github.com/fpt-event-services/common/utils"
)

// TimeValidationError represents a time validation error
type TimeValidationError struct {
	Message string
}

func (e *TimeValidationError) Error() string {
	return e.Message
}

// ValidateEventTime validates event start and end times with comprehensive business rules
// Returns error if validation fails
//
// Validation Rules:
// 1. Start time must not be in the past
// 2. End time must be after start time
// 3. Start and end must be on the same day
// 4. Event duration must be at least 60 minutes
// 5. Event duration must not exceed 18 hours
// 6. Event should be scheduled at least 24 hours in advance
// 7. Event should be scheduled within 1 year (365 days)
// 8. Event start time must be between 07:00 and 21:00
// 9. Event end time must be before 21:00
func ValidateEventTime(startTime, endTime time.Time) error {
	now := utils.NowInVietnam()
	startTime = utils.ToVietnamTime(startTime)
	endTime = utils.ToVietnamTime(endTime)

	// 1. Start time must not be in the past (allow 5 minute buffer for clock skew)
	if startTime.Before(now.Add(-5 * time.Minute)) {
		return &TimeValidationError{
			Message: "Thời gian bắt đầu không được trong quá khứ",
		}
	}

	// 2. End time must be after start time
	if endTime.Before(startTime) || endTime.Equal(startTime) {
		return &TimeValidationError{
			Message: "Thời gian kết thúc phải sau thời gian bắt đầu",
		}
	}

	// 3. Start and end must be on the same day (same date in local timezone)
	startDate := startTime.Format("2006-01-02")
	endDate := endTime.Format("2006-01-02")
	if startDate != endDate {
		return &TimeValidationError{
			Message: "Sự kiện phải diễn ra trong cùng một ngày (thời gian kết thúc phải cùng ngày với thời gian bắt đầu)",
		}
	}

	// 4. Event duration must be at least 60 minutes (updated from 30 minutes)
	duration := endTime.Sub(startTime)
	if duration < 60*time.Minute {
		return &TimeValidationError{
			Message: "Sự kiện phải kéo dài ít nhất 60 phút",
		}
	}

	// 5. Event duration must not exceed 18 hours (reasonable limit for single-day event)
	if duration > 18*time.Hour {
		return &TimeValidationError{
			Message: "Sự kiện không được kéo dài quá 18 giờ trong một ngày",
		}
	}

	// 6. Event should be scheduled at least 24 hours in advance (for proper planning)
	minAdvanceTime := now.Add(24 * time.Hour)
	if startTime.Before(minAdvanceTime) {
		fmt.Printf("[ValidateEventTime] 24-hour check failed - Now: %s, StartTime: %s, MinAdvanceTime: %s, Difference: %v hours\n",
			now.Format(time.RFC3339),
			startTime.Format(time.RFC3339),
			minAdvanceTime.Format(time.RFC3339),
			startTime.Sub(now).Hours())
		return &TimeValidationError{
			Message: "Sự kiện phải được lên lịch trước ít nhất 24 giờ",
		}
	}

	// 7. Event should be scheduled within 365 days (1 year)
	maxScheduleTime := now.AddDate(0, 0, 365)
	if startTime.After(maxScheduleTime) {
		return &TimeValidationError{
			Message: "Sự kiện không được lên lịch quá 365 ngày từ hiện tại",
		}
	}

	// 8. Event start time must be between 07:00 and 21:00 (updated from 6:00-23:00)
	startHour := startTime.Hour()
	startMinute := startTime.Minute()

	if startHour < 7 || startHour > 21 || (startHour == 21 && startMinute > 0) {
		return &TimeValidationError{
			Message: "Sự kiện phải bắt đầu trước 21:00 (giờ bắt đầu sớm nhất: 07:00)",
		}
	}

	// 9. Event end time must be before 21:00 (new requirement)
	endHour := endTime.Hour()
	endMinute := endTime.Minute()

	if endHour > 21 || (endHour == 21 && endMinute > 0) {
		return &TimeValidationError{
			Message: "Sự kiện cần kết thúc trước 21:00 để dọn dẹp",
		}
	}

	return nil
}

// ParseEventTime parses time string in either ISO8601 or SQL datetime format
func ParseEventTime(timeStr string) (time.Time, error) {
	// Try ISO8601 format first: "2006-01-02T15:04:05Z"
	t, err := time.Parse(time.RFC3339, timeStr)
	if err == nil {
		return t, nil
	}

	// Try with timezone: "2006-01-02T15:04:05+07:00"
	t, err = time.Parse("2006-01-02T15:04:05Z07:00", timeStr)
	if err == nil {
		return t, nil
	}

	// Try ISO8601 without Z: "2006-01-02T15:04:05"
	t, err = time.ParseInLocation("2006-01-02T15:04:05", timeStr, utils.VietnamLocation())
	if err == nil {
		return t, nil
	}

	// Try datetime-local format from HTML input: "2006-01-02T15:04"
	t, err = time.ParseInLocation("2006-01-02T15:04", timeStr, utils.VietnamLocation())
	if err == nil {
		return t, nil
	}

	// Try SQL datetime format: "2006-01-02 15:04:05"
	t, err = time.ParseInLocation("2006-01-02 15:04:05", timeStr, utils.VietnamLocation())
	if err == nil {
		return t, nil
	}

	// Try without seconds: "2006-01-02 15:04"
	t, err = time.ParseInLocation("2006-01-02 15:04", timeStr, utils.VietnamLocation())
	if err == nil {
		return t, nil
	}

	return time.Time{}, fmt.Errorf("invalid time format: %s", timeStr)
}

// FormatEventTimeForUTCStorage converts a parsed event time to UTC SQL datetime.
// Input can be Vietnam-local or any timezone-aware time; output is always UTC.
// ⚠️ DEPRECATED: Use FormatEventTimeAsWallClockTime instead to preserve actual wall-clock times
func FormatEventTimeForUTCStorage(t time.Time) string {
	return t.UTC().Format("2006-01-02 15:04:05")
}

// FormatEventTimeAsWallClockTime preserves the wall-clock time without timezone conversion.
// This ensures that when a user inputs "09:00 AM Vietnam time", it's saved as "09:00:00"
// in the database with the DSN timezone handler managing interpretation.
// ✅ RECOMMENDED: Use this instead of FormatEventTimeForUTCStorage to maintain wall-clock time integrity
func FormatEventTimeAsWallClockTime(t time.Time) string {
	// Convert to Vietnam timezone first to ensure we're working with the intended time
	vietnamTime := t.In(utils.VietnamLocation())
	// Format WITHOUT timezone conversion - preserve the wall-clock time
	return vietnamTime.Format("2006-01-02 15:04:05")
}
