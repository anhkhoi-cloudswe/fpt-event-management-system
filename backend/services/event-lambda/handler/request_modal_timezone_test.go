package handler

import (
	"testing"
	"time"

	"github.com/fpt-event-services/common/utils"
)

// TestRequestModalTimeflow_Smoke mimics the complete flow:
// 1. User inputs "09:00" (Vietnam time)
// 2. System stores it as UTC in DB
// 3. System fetches it back
// 4. Request modal receives JSON with times
// EXPECTED: JSON should show "09:00:00+07:00" (Vietnam time)
func TestRequestModalTimeflow_Smoke(t *testing.T) {
	// ===== STEP 1: User Input - "09:00" (Vietnam time) =====
	userInputStart := "2026-03-31T09:00:00"
	userInputEnd := "2026-03-31T10:00:00"

	// ===== STEP 2: Parse Input (what handler does) =====
	startTime, err := ParseEventTime(userInputStart)
	if err != nil {
		t.Fatalf("ParseEventTime failed: %v", err)
	}

	endTime, err := ParseEventTime(userInputEnd)
	if err != nil {
		t.Fatalf("ParseEventTime failed: %v", err)
	}

	t.Logf("After parsing: start=%s (zone=%v), end=%s (zone=%v)",
		startTime.Format(time.RFC3339), startTime.Location(),
		endTime.Format(time.RFC3339), endTime.Location())

	// ===== STEP 3: Validate (what handler does) =====
	if err := ValidateEventTime(startTime, endTime); err != nil {
		t.Logf("⚠️ Validation failed (expected for backward time): %v", err)
		// For test, use future time
		startTime = time.Date(2026, 4, 1, 9, 0, 0, 0, utils.VietnamLocation())
		endTime = time.Date(2026, 4, 1, 10, 0, 0, 0, utils.VietnamLocation())
	}

	// ===== STEP 4: Convert to UTC for Storage (what handler does) =====
	utcStorageStart := FormatEventTimeForUTCStorage(startTime)
	utcStorageEnd := FormatEventTimeForUTCStorage(endTime)

	t.Logf("Formatted for UTC storage: start=%s, end=%s", utcStorageStart, utcStorageEnd)

	// ===== STEP 5: Simulate DB Read (what repository does) =====
	// Parse back the strings as they would come from MySQL DATETIME
	dbTime, err := time.Parse("2006-01-02 15:04:05", utcStorageStart)
	if err != nil {
		t.Fatalf("Failed to parse db time: %v", err)
	}

	// When MySQL driver reads DATETIME, it returns with zone=UTC
	dbTimeWithUTCZone := dbTime.UTC()

	t.Logf("After DB read (UTC zone): %s", dbTimeWithUTCZone.Format(time.RFC3339))

	// ===== STEP 6: Convert back to Vietnam time for JSON (what repository does) =====
	vietnamTime := utils.DBTimeToVietnamTime(dbTimeWithUTCZone)
	jsonOutput := vietnamTime.Format(time.RFC3339)

	t.Logf("Final JSON output: %s", jsonOutput)

	// ===== VERIFICATION =====
	expectedJSON := "2026-03-31T09:00:00+07:00"
	if jsonOutput != expectedJSON {
		t.Errorf("JSON output mismatch!\n  got:  %s\n  want: %s", jsonOutput, expectedJSON)
	}
}
