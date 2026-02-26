package hash

import (
	"strings"
	"testing"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantLen  int
	}{
		{"Normal password", "Pass123", 64},
		{"Complex password", "Abc@123#XYZ", 64},
		{"Empty string", "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := HashPassword(tt.password)
			if len(got) != tt.wantLen {
				t.Errorf("HashPassword() length = %v, want %v", len(got), tt.wantLen)
			}
		})
	}
}

func TestVerifyPassword(t *testing.T) {
	plainPassword := "Pass123"
	hash := HashPassword(plainPassword)

	tests := []struct {
		name     string
		plain    string
		hash     string
		expected bool
	}{
		{"Correct password", plainPassword, hash, true},
		{"Wrong password", "WrongPass", hash, false},
		{"Empty plain", "", hash, false},
		{"Empty hash", plainPassword, "", false},
		{"Case insensitive hash", plainPassword, strings.ToUpper(hash), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := VerifyPassword(tt.plain, tt.hash)
			if got != tt.expected {
				t.Errorf("VerifyPassword() = %v, want %v", got, tt.expected)
			}
		})
	}
}

// Test to verify SHA-256 produces expected output
// This ensures our implementation is correct and stable
func TestSHA256Consistency(t *testing.T) {
	// Known SHA-256 hash of "Pass123" (UTF-8 encoded)
	// Calculated using standard SHA-256 algorithm
	expectedHash := "08fa299aecc0c034e037033e3b0bbfaef26b78c742f16cf88ac3194502d6c394"

	goHash := HashPassword("Pass123")

	if goHash != expectedHash {
		t.Errorf("Hash mismatch.\nGot:      %s\nExpected: %s", goHash, expectedHash)
	}
}
