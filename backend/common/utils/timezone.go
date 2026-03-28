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
