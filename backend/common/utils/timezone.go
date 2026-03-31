package utils

import (
	"time"

	"github.com/fpt-event-services/common/timeutil"
)

var (
	vietnamLocationName = "Asia/Ho_Chi_Minh"
	fallbackVietnamLoc  = time.FixedZone("GMT+7", 7*60*60)
)

// VietnamLocation returns the canonical Vietnam timezone location.
func VietnamLocation() *time.Location {
	loc, err := time.LoadLocation(vietnamLocationName)
	if err != nil {
		return fallbackVietnamLoc
	}
	return loc
}

// ToVietnamTime converts any time value to Asia/Ho_Chi_Minh.
func ToVietnamTime(t time.Time) time.Time {
	if t.IsZero() {
		return t
	}
	return t.In(VietnamLocation())
}

// NormalizeDBTimeAsUTC reinterprets DB-scanned wall-clock timestamps as UTC.
// This prevents "fake +07" outputs when DATETIME values are stored in UTC
// but read with a non-UTC location.
func NormalizeDBTimeAsUTC(t time.Time) time.Time {
	if t.IsZero() {
		return t
	}

	return time.Date(
		t.Year(), t.Month(), t.Day(),
		t.Hour(), t.Minute(), t.Second(), t.Nanosecond(),
		time.UTC,
	)
}

// DBTimeToVietnamTime converts DB time to Vietnam time via timezone conversion.
func DBTimeToVietnamTime(t time.Time) time.Time {
	if t.IsZero() {
		return t
	}
	loc := VietnamLocation()
	return t.In(loc)
}

// DBTimeToVNRFC3339 formats DB time as RFC3339 in Vietnam timezone.
// ⚠️ DEPRECATED: This applies timezone conversion which causes double-shift on wall-clock values.
// Use FormatTimeToWallClockRFC3339() instead.
func DBTimeToVNRFC3339(t time.Time) string {
	t = DBTimeToVietnamTime(t)
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

// FormatTimeToWallClockRFC3339 formats a wall-clock time.Time as RFC3339 with +07:00 offset.
// This is the CORRECT function for wall-clock DATETIME values from the database.
// It does NOT apply timezone conversion - just manual +07:00 append.
// Use this instead of DBTimeToVNRFC3339 when displaying event times to emails/PDFs.
func FormatTimeToWallClockRFC3339(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	// Format: "2026-04-01T09:00:00+07:00"
	// Do NOT use .In() - just append +07:00 to wall-clock value
	return t.Format("2006-01-02T15:04:05") + "+07:00"
}

// NowInVietnam returns current time in Asia/Ho_Chi_Minh.
// This function respects the SYSTEM_TIME_OVERRIDE environment variable.
func NowInVietnam() time.Time {
	return timeutil.GetNow().In(VietnamLocation())
}

// FormatVietnamDateTime formats a timestamp as HH:mm dd/MM/yyyy in Vietnam timezone.
func FormatVietnamDateTime(t time.Time) string {
	t = ToVietnamTime(t)
	if t.IsZero() {
		return ""
	}
	return t.Format("15:04 02/01/2006")
}

// FormatToVNTime formats a timestamp as HH:mm in Vietnam timezone.
func FormatToVNTime(t time.Time) string {
	t = ToVietnamTime(t)
	if t.IsZero() {
		return ""
	}
	return t.Format("15:04")
}
