package utils

import "time"

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

// DBTimeToVietnamTime converts DB time to Vietnam time using UTC reinterpretation.
func DBTimeToVietnamTime(t time.Time) time.Time {
	if t.IsZero() {
		return t
	}
	return ToVietnamTime(NormalizeDBTimeAsUTC(t))
}

// DBTimeToVNRFC3339 formats DB time as RFC3339 in Vietnam timezone.
func DBTimeToVNRFC3339(t time.Time) string {
	t = DBTimeToVietnamTime(t)
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

// NowInVietnam returns current time in Asia/Ho_Chi_Minh.
func NowInVietnam() time.Time {
	return time.Now().In(VietnamLocation())
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
