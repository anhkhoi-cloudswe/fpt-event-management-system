package utils

import (
	"testing"
)

func TestSanitizeDescription(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "standard order code",
			input:    "FEMS DH12345",
			expected: "FEMS DH12345",
		},
		{
			name:     "vietnamese diacritics and accents",
			input:    "FEMS Đặt vé Sự Kiện ABC 123",
			expected: "FEMS t v S Kin ABC 123",
		},
		{
			name:     "length exceeds 25 characters",
			input:    "FEMS VERY LONG DESCRIPTION EXCEEDING 25 CHARS",
			expected: "FEMS VERY LONG DESCRIPTIO",
		},
		{
			name:     "empty description fallback",
			input:    "",
			expected: "FEMS Ticket",
		},
		{
			name:     "special symbols stripped",
			input:    "FEMS #12345 - @Event!",
			expected: "FEMS 12345  Event",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeDescription(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeDescription(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
			if len(result) > 25 {
				t.Errorf("sanitizeDescription(%q) length %d exceeds max 25", tt.input, len(result))
			}
		})
	}
}

func TestPayOSService_IsConfigured(t *testing.T) {
	svc := &PayOSService{}
	if svc.IsConfigured() {
		t.Error("Expected uninitialized PayOSService to return false for IsConfigured()")
	}
}
