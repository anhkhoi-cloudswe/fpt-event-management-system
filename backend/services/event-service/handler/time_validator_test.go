package handler

import (
	"testing"
	"time"
)

func TestValidateEventTime(t *testing.T) {
	vnLoc := time.FixedZone("+07", 7*60*60)
	now := time.Now().In(vnLoc)

	// Create a valid base time in Vietnam timezone (2 days later, 10:00 -> 12:00)
	validStart := time.Date(now.Year(), now.Month(), now.Day(), 10, 0, 0, 0, vnLoc).AddDate(0, 0, 2)

	tests := []struct {
		name        string
		startTime   time.Time
		endTime     time.Time
		shouldError bool
		errorMsg    string
	}{
		{
			name:        "Valid future event",
			startTime:   validStart,
			endTime:     validStart.Add(2 * time.Hour),
			shouldError: false,
		},
		{
			name:        "Past start time",
			startTime:   now.Add(-2 * time.Hour), // 2 hours ago
			endTime:     now.Add(-1 * time.Hour), // 1 hour ago
			shouldError: true,
			errorMsg:    "quá khứ",
		},
		{
			name:        "End before start",
			startTime:   validStart,
			endTime:     validStart.Add(-1 * time.Hour), // 1 hour before start
			shouldError: true,
			errorMsg:    "phải sau",
		},
		{
			name:        "Different days",
			startTime:   time.Date(validStart.Year(), validStart.Month(), validStart.Day(), 15, 0, 0, 0, vnLoc),
			endTime:     time.Date(validStart.Year(), validStart.Month(), validStart.Day(), 9, 0, 0, 0, vnLoc).Add(24 * time.Hour),
			shouldError: true,
			errorMsg:    "cùng một ngày",
		},
		{
			name:        "Too short duration (15 minutes)",
			startTime:   validStart,
			endTime:     validStart.Add(15 * time.Minute),
			shouldError: true,
			errorMsg:    "60 phút",
		},
		{
			name:        "Too long duration (20 hours)",
			startTime:   time.Date(validStart.Year(), validStart.Month(), validStart.Day(), 7, 0, 0, 0, vnLoc),
			endTime:     time.Date(validStart.Year(), validStart.Month(), validStart.Day(), 21, 30, 0, 0, vnLoc),
			shouldError: true,
			errorMsg:    "kết thúc trước 21:00",
		},
		{
			name:        "Less than 24h advance",
			startTime:   now.Add(20 * time.Hour), // 20 hours from now
			endTime:     now.Add(22 * time.Hour),
			shouldError: true,
			errorMsg:    "24 giờ",
		},
		{
			name:        "Too far in future (2 years)",
			startTime:   time.Date(now.Year()+2, now.Month(), now.Day(), 10, 0, 0, 0, vnLoc),
			endTime:     time.Date(now.Year()+2, now.Month(), now.Day(), 12, 0, 0, 0, vnLoc),
			shouldError: true,
			errorMsg:    "365 ngày",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateEventTime(tt.startTime, tt.endTime)

			if tt.shouldError {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.errorMsg)
				} else if tt.errorMsg != "" && !contains(err.Error(), tt.errorMsg) {
					t.Errorf("Expected error containing '%s', got '%s'", tt.errorMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got: %v", err)
				}
			}
		})
	}
}

func TestParseEventTime(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		shouldError bool
	}{
		{
			name:        "ISO8601 with Z",
			input:       "2026-02-01T14:00:00Z",
			shouldError: false,
		},
		{
			name:        "ISO8601 with timezone",
			input:       "2026-02-01T14:00:00+07:00",
			shouldError: false,
		},
		{
			name:        "SQL datetime format",
			input:       "2026-02-01 14:00:00",
			shouldError: false,
		},
		{
			name:        "SQL datetime without seconds",
			input:       "2026-02-01 14:00",
			shouldError: false,
		},
		{
			name:        "Invalid format",
			input:       "2026/02/01 14:00:00",
			shouldError: true,
		},
		{
			name:        "Empty string",
			input:       "",
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseEventTime(tt.input)

			if tt.shouldError && err == nil {
				t.Error("Expected error, got nil")
			}
			if !tt.shouldError && err != nil {
				t.Errorf("Expected no error, got: %v", err)
			}
		})
	}
}

func TestFormatEventTimeForUTCStorage(t *testing.T) {
	vnLoc := time.FixedZone("+07", 7*60*60)
	input := time.Date(2026, 3, 31, 7, 0, 0, 0, vnLoc)

	got := FormatEventTimeForUTCStorage(input)
	want := "2026-03-31 00:00:00"

	if got != want {
		t.Fatalf("FormatEventTimeForUTCStorage() = %q, want %q", got, want)
	}
}

func TestParseEventTimeAndFormatUTCStorage_FromVietnamLocalString(t *testing.T) {
	parsed, err := ParseEventTime("2026-03-31T07:00:00")
	if err != nil {
		t.Fatalf("ParseEventTime() unexpected error: %v", err)
	}

	got := FormatEventTimeForUTCStorage(parsed)
	want := "2026-03-31 00:00:00"

	if got != want {
		t.Fatalf("Parse+Format UTC storage = %q, want %q", got, want)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > len(substr) && containsHelper(s, substr)))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
