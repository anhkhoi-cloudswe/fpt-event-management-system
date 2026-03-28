package utils

import (
	"testing"
	"time"
)

func TestFormatToVNTime_UTCToVietnam(t *testing.T) {
	utcTime := time.Date(2026, 3, 28, 2, 0, 0, 0, time.UTC)

	got := FormatToVNTime(utcTime)
	want := "09:00"

	if got != want {
		t.Fatalf("FormatToVNTime() = %q, want %q", got, want)
	}
}

func TestFormatToVNTime_UTCToVietnam_CrossDay(t *testing.T) {
	utcTime := time.Date(2026, 3, 28, 18, 30, 0, 0, time.UTC)

	got := FormatToVNTime(utcTime)
	want := "01:30"

	if got != want {
		t.Fatalf("FormatToVNTime() = %q, want %q", got, want)
	}
}

func TestFormatToVNTime_ZeroTime(t *testing.T) {
	got := FormatToVNTime(time.Time{})

	if got != "" {
		t.Fatalf("FormatToVNTime() = %q, want empty string", got)
	}
}

func TestDBTimeToVietnamTime_UTCMidnightTo0700(t *testing.T) {
	utcTime := time.Date(2026, 3, 30, 0, 0, 0, 0, time.UTC)

	got := DBTimeToVietnamTime(utcTime)

	if got.Format(time.RFC3339) != "2026-03-30T07:00:00+07:00" {
		t.Fatalf("DBTimeToVietnamTime() = %s, want %s", got.Format(time.RFC3339), "2026-03-30T07:00:00+07:00")
	}
}
