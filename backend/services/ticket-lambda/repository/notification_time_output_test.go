package repository

import (
	"testing"
	"time"

	"github.com/fpt-event-services/common/utils"
)

func TestNotificationPayloadTime_IsVietnamClockAfterDBNormalization(t *testing.T) {
	vnLoc := utils.VietnamLocation()

	// Simulate DB-scanned wall-clock timestamps that represent UTC values.
	startDB := time.Date(2026, 3, 31, 2, 0, 0, 0, vnLoc)
	endDB := time.Date(2026, 3, 31, 9, 0, 0, 0, vnLoc)

	startRFC3339 := utils.DBTimeToVNRFC3339(startDB)
	endRFC3339 := utils.DBTimeToVNRFC3339(endDB)

	if startRFC3339 != "2026-03-31T09:00:00+07:00" {
		t.Fatalf("start_time mismatch: got=%s", startRFC3339)
	}
	if endRFC3339 != "2026-03-31T16:00:00+07:00" {
		t.Fatalf("end_time mismatch: got=%s", endRFC3339)
	}

	startClock := formatVNClockFromRFC3339(startRFC3339)
	endClock := formatVNClockFromRFC3339(endRFC3339)

	if startClock != "09:00" {
		t.Fatalf("start clock mismatch: got=%s", startClock)
	}
	if endClock != "16:00" {
		t.Fatalf("end clock mismatch: got=%s", endClock)
	}
}
