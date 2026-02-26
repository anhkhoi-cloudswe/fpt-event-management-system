package handler

import (
	"testing"
	"time"
)

func TestValidateEventTime(t *testing.T) {
	now := time.Now()

	// Create a valid base time (tomorrow at 2 PM)
	tomorrow := now.AddDate(0, 0, 2).Truncate(24 * time.Hour).Add(14 * time.Hour)

	tests := []struct {
		name        string
		startTime   time.Time
		endTime     time.Time
		shouldError bool
		errorMsg    string
	}{
		{
			name:        "Valid future event",
			startTime:   tomorrow,                    // Tomorrow 2 PM
			endTime:     tomorrow.Add(2 * time.Hour), // Tomorrow 4 PM
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
			startTime:   tomorrow,
			endTime:     tomorrow.Add(-1 * time.Hour), // 1 hour before start
			shouldError: true,
			errorMsg:    "phải sau",
		},
		{
			name:        "Different days",
			startTime:   tomorrow.Truncate(24 * time.Hour).Add(15 * time.Hour), // 3 PM
			endTime:     tomorrow.Add(24 * time.Hour).Add(9 * time.Hour),       // 9 AM next day
			shouldError: true,
			errorMsg:    "cùng một ngày",
		},
		{
			name:        "Too short duration (15 minutes)",
			startTime:   tomorrow,
			endTime:     tomorrow.Add(15 * time.Minute),
			shouldError: true,
			errorMsg:    "30 phút",
		},
		{
			name:        "Too long duration (20 hours)",
			startTime:   tomorrow.Truncate(24 * time.Hour).Add(7 * time.Hour),  // 7 AM
			endTime:     tomorrow.Truncate(24 * time.Hour).Add(27 * time.Hour), // 3 AM next day (would fail same-day first)
			shouldError: true,
			// Will fail on same-day check before duration check
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
			startTime:   now.AddDate(2, 0, 0),
			endTime:     now.AddDate(2, 0, 0).Add(2 * time.Hour),
			shouldError: true,
			errorMsg:    "1 năm",
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
