package hash

import (
	"strings"
	"testing"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name       string
		password   string
		shouldPass bool
	}{
		{"Normal password", "Pass123", true},
		{"Complex password", "Abc@123#XYZ", true},
		{"Empty string", "", false}, // Should fail
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := HashPassword(tt.password)
			if tt.shouldPass {
				if err != nil {
					t.Errorf("HashPassword() error = %v, want nil", err)
				}
				// Bcrypt hashes start with $2a$ and are roughly 60 characters
				if len(got) < 50 || !strings.HasPrefix(got, "$2a$") {
					t.Errorf("HashPassword() format is incorrect: %s", got)
				}
			} else {
				if err == nil {
					t.Errorf("HashPassword() error = nil, want non-nil")
				}
			}
		})
	}
}

func TestVerifyPassword(t *testing.T) {
	plainPassword := "Pass123"
	hash, err := HashPassword(plainPassword)
	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

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

// Test to verify Bcrypt+Legacy password verification
// This ensures our implementation correctly handles both Bcrypt and legacy formats
func TestBcryptAndLegacySupport(t *testing.T) {
	plainPassword := "Pass123"

	// Test Bcrypt
	bcryptHash, err := HashPassword(plainPassword)
	if err != nil {
		t.Fatalf("Failed to create bcrypt hash: %v", err)
	}

	if !VerifyPassword(plainPassword, bcryptHash) {
		t.Error("VerifyPassword failed for Bcrypt hash")
	}

	// Test legacy SHA-256 support
	sha256Hash := "08fa299aecc0c034e037033e3b0bbfaef26b78c742f16cf88ac3194502d6c394" // SHA-256 of "Pass123"
	if !VerifyPassword(plainPassword, sha256Hash) {
		t.Error("VerifyPassword failed for SHA-256 legacy hash")
	}
}
