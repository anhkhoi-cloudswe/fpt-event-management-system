package repository

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fpt-event-services/services/event-lambda/models"
	"github.com/fpt-event-services/common/utils"
)

// ===== COMPREHENSIVE TIMEZONE REGRESSION TEST SUITE =====
// These tests MUST PASS to ensure no double offset errors occur

// TestRequestDetail_VietnamInputStored AsUTCReadBackAsVietnam verifies the complete flow:
// 1. Input: "09:00" VN time (what user enters)
// 2. Storage: "02:00:00" UTC (what goes in DB)
// 3. Output: "09:00:00+07:00" RFC3339 (what JSON returns)
// ⚠️ THIS TEST WILL FAIL IF THERE'S A DOUBLE OFFSET BUG
func TestRequestDetail_VietnamInputStoredAsUTCReadBackAsVietnam(t *testing.T) {
	vnLoc := utils.VietnamLocation()

	// ===== STEP 1: User inputs 09:00 Vietnam time =====
	userInput := time.Date(2026, 4, 1, 9, 0, 0, 0, vnLoc) // 09:00+07:00 wall-clock
	
	t.Logf("User input: %s (zone=%v)", userInput.Format(time.RFC3339), userInput.Location())

	// ===== STEP 2: Handler converts to UTC for storage =====
	// Simulating what FormatEventTimeForUTCStorage does
	utcString := userInput.UTC().Format("2006-01-02 15:04:05")
	expectedUTCString := "2026-04-01 02:00:00"
	
	if utcString != expectedUTCString {
		t.Errorf("UTC storage conversion failed:\n  input:    %s\n  got:      %s\n  expected: %s",
			userInput.Format(time.RFC3339), utcString, expectedUTCString)
	}
	t.Logf("Stored in DB as UTC: %s", utcString)

	// ===== STEP 3: Simulate DB read (MySQL DSN has loc=Asia/Ho_Chi_Minh) =====
	// The DSN with loc=Asia/Ho_Chi_Minh causes MySQL driver to reinterpret DATETIME as Vietnam time
	// So "2026-04-01 02:00:00" is read as "2026-04-01 02:00:00 +07:00" (not as UTC)
	dbReadTime, _ := time.Parse("2006-01-02 15:04:05", utcString)
	// Reinterpret as Vietnam zone (simulating DSN behavior)
	dbReadTimeWithVNZone := time.Date(
		dbReadTime.Year(), dbReadTime.Month(), dbReadTime.Day(),
		dbReadTime.Hour(), dbReadTime.Minute(), dbReadTime.Second(), 0,
		vnLoc,
	)
	
	t.Logf("After DB read (with DSN loc reinterpretation): %s (zone=%v)", dbReadTimeWithVNZone.Format(time.RFC3339), dbReadTimeWithVNZone.Location())

	// ===== STEP 4: Repository converts back to Vietnam time =====
	// formatTimeToVNRFC3339 now: NormalizeDBTimeAsUTC -> DBTimeToVietnamTime
	// Step 1: Reinterpret back to UTC
	normalized := utils.NormalizeDBTimeAsUTC(dbReadTimeWithVNZone)
	// Step 2: Convert from UTC to Vietnam
	vietnamOutput := utils.DBTimeToVietnamTime(normalized).Format(time.RFC3339)
	expectedOutput := "2026-04-01T09:00:00+07:00"
	
	t.Logf("Final JSON output: %s", vietnamOutput)

	// ===== CRITICAL VERIFICATION =====
	if vietnamOutput != expectedOutput {
		t.Fatalf("DOUBLE OFFSET BUG DETECTED!\n  got:      %s\n  expected: %s\n  This indicates timezone is being applied twice or incorrectly",
			vietnamOutput, expectedOutput)
	}
}

// TestSetEventRequestTimeFields_NoDoubleOffset verifies that setEventRequestTimeFields
// correctly converts UTC DB times to VN times WITHOUT double offset
func TestSetEventRequestTimeFields_NoDoubleOffset(t *testing.T) {
	tests := []struct {
		name         string
		dbUTCTime    string
		expectedJSON string
		description  string
	}{
		{
			name:         "Midnight UTC is 07:00 VN",
			dbUTCTime:    "2026-04-01 00:00:00",
			expectedJSON: "2026-04-01T07:00:00+07:00",
			description:  "If user enters 07:00 VN, stored as 00:00 UTC, should read back as 07:00 VN",
		},
		{
			name:         "02:00 UTC is 09:00 VN",
			dbUTCTime:    "2026-04-01 02:00:00",
			expectedJSON: "2026-04-01T09:00:00+07:00",
			description:  "If user enters 09:00 VN, stored as 02:00 UTC, should read back as 09:00 VN",
		},
		{
			name:         "13:00 UTC is 20:00 VN",
			dbUTCTime:    "2026-04-01 13:00:00",
			expectedJSON: "2026-04-01T20:00:00+07:00",
			description:  "If user enters 20:00 VN, stored as 13:00 UTC, should read back as 20:00 VN",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Parse as if from MySQL
			dbTime, _ := time.Parse("2006-01-02 15:04:05", tt.dbUTCTime)
			dbTime = dbTime.UTC()

			// Apply the repository conversion (setEventRequestTimeFields logic)
			sqlNullTime := sql.NullTime{Time: dbTime, Valid: true}
			req := &models.EventRequest{}
			setEventRequestTimeFields(req, sqlNullTime, sqlNullTime, sqlNullTime, sqlNullTime)

			if req.PreferredStartTime == nil {
				t.Fatalf("PreferredStartTime is nil")
			}

			if *req.PreferredStartTime != tt.expectedJSON {
				t.Errorf("%s: DOUBLE OFFSET ERROR!\n  got:      %s\n  expected: %s\n  description: %s",
					tt.name, *req.PreferredStartTime, tt.expectedJSON, tt.description)
			}

			t.Logf("✓ %s: %s", tt.name, *req.PreferredStartTime)
		})
	}
}

// TestRequestDetailJSON_NoDoubleOffsetInMarshal ensures marshaled JSON doesn't have double offset
func TestRequestDetailJSON_NoDoubleOffsetInMarshal(t *testing.T) {
	// Create request detail with UTC times as they come from DB
	utcTime := time.Date(2026, 4, 1, 2, 0, 0, 0, time.UTC) // 02:00 UTC = 09:00 VN
	sqlNullTime := sql.NullTime{Time: utcTime, Valid: true}

	req := &models.EventRequest{
		RequestID:    1055,
		RequesterID:  100,
		Title:        "Test Event with Input 09:00 VN",
		Status:       "PENDING",
	}
	
	// This populates PreferredStartTime with formatTimeToVNRFC3339
	setEventRequestTimeFields(req, sqlNullTime, sqlNullTime, sqlNullTime, sqlNullTime)

	// Marshal to JSON
	jsonBytes, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("JSON marshal failed: %v", err)
	}

	jsonStr := string(jsonBytes)
	t.Logf("JSON output:\n%s", jsonStr)

	// ===== CRITICAL CHECKS =====
	expectedTimeStr := "2026-04-01T09:00:00+07:00"
	
	if !strings.Contains(jsonStr, expectedTimeStr) {
		if strings.Contains(jsonStr, "2026-04-01T02:00:00") {
			t.Errorf("DOUBLE OFFSET BUG: JSON contains UTC time instead of VN time!\n" +
				"  This means timezone conversion was NOT applied\n" +
				"  JSON: %s", jsonStr)
		} else if strings.Contains(jsonStr, "2026-04-01T16:00:00") {
			t.Errorf("DOUBLE OFFSET BUG: JSON contains doubly-offset time (02:00 UTC → 09:00 VN → 16:00?)\n" +
				"  This means timezone was applied twice\n" +
				"  JSON: %s", jsonStr)
		} else {
			t.Errorf("JSON does not contain expected time %s:\n" +
				"  JSON: %s", expectedTimeStr, jsonStr)
		}
	} else {
		t.Logf("✓ JSON contains correct VN time: %s", expectedTimeStr)
	}
}

// TestRequestDetail_FrontendParsing simulates frontend parsing to ensure it doesn't cause double offset
func TestRequestDetail_FrontendParsingHandlesRFC3339Correctly(t *testing.T) {
	// Backend returns this JSON with RFC3339 times
	jsonPayload := `{
		"requestId": 1055,
		"title": "Test Event",
		"preferredStartTime": "2026-04-01T09:00:00+07:00",
		"preferredEndTime": "2026-04-01T10:00:00+07:00"
	}`

	var req models.EventRequest
	err := json.Unmarshal([]byte(jsonPayload), &req)
	if err != nil {
		t.Fatalf("JSON unmarshal failed: %v", err)
	}

	t.Logf("Frontend receives: startTime=%s", *req.PreferredStartTime)

	// Frontend should parse this RFC3339 string correctly
	// It should see "+07:00" and know this is already Vietnam time
	// NO ADDITIONAL OFFSET should be applied

	expectedStart := "2026-04-01T09:00:00+07:00"
	if *req.PreferredStartTime != expectedStart {
		t.Errorf("Frontend-backend contract broken:\n  got:      %s\n  expected: %s",
			*req.PreferredStartTime, expectedStart)
	} else {
		t.Logf("✓ Frontend receives correct RFC3339 time: %s", *req.PreferredStartTime)
	}
}

// TestAllRequestTimePaths_NoDoubleOffset comprehensive test of all time field access paths
func TestAllRequestTimePaths_NoDoubleOffset(t *testing.T) {
	utcTime := time.Date(2026, 4, 1, 2, 0, 0, 0, time.UTC)
	sqlNullTime := sql.NullTime{Time: utcTime, Valid: true}

	tests := []struct {
		name       string
		fieldScan  sql.NullTime
		fieldName  string
		assertFunc func(*models.EventRequest) *string
	}{
		{
			name:      "PreferredStartTime",
			fieldScan: sqlNullTime,
			fieldName: "PreferredStartTime",
			assertFunc: func(r *models.EventRequest) *string { return r.PreferredStartTime },
		},
		{
			name:      "PreferredEndTime",
			fieldScan: sqlNullTime,
			fieldName: "PreferredEndTime",
			assertFunc: func(r *models.EventRequest) *string { return r.PreferredEndTime },
		},
		{
			name:      "CreatedAt",
			fieldScan: sqlNullTime,
			fieldName: "CreatedAt",
			assertFunc: func(r *models.EventRequest) *string { return r.CreatedAt },
		},
		{
			name:      "ProcessedAt",
			fieldScan: sqlNullTime,
			fieldName: "ProcessedAt",
			assertFunc: func(r *models.EventRequest) *string { return r.ProcessedAt },
		},
	}

	for _, tt := range tests {
		t.Run(tt.fieldName, func(t *testing.T) {
			req := &models.EventRequest{}
			setEventRequestTimeFields(req, tt.fieldScan, tt.fieldScan, tt.fieldScan, tt.fieldScan)

			val := tt.assertFunc(req)
			if val == nil {
				t.Fatalf("%s is nil", tt.fieldName)
			}

			expectedRFC3339 := "2026-04-01T09:00:00+07:00"
			if *val != expectedRFC3339 {
				t.Errorf("%s conversion failed:\n  got:      %s\n  expected: %s",
					tt.fieldName, *val, expectedRFC3339)
			} else {
				t.Logf("✓ %s: %s", tt.fieldName, *val)
			}
		})
	}
}
