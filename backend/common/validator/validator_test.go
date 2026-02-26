package validator

import (
	"testing"
)

func TestIsValidEmail(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		expected bool
	}{
		{"Valid email", "user@fpt.edu.vn", true},
		{"Valid with +", "user+tag@example.com", true},
		{"Invalid - no @", "userexample.com", false},
		{"Invalid - no domain", "user@", false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidEmail(tt.email)
			if got != tt.expected {
				t.Errorf("IsValidEmail(%q) = %v, want %v", tt.email, got, tt.expected)
			}
		})
	}
}

func TestIsValidVNPhone(t *testing.T) {
	tests := []struct {
		name     string
		phone    string
		expected bool
	}{
		{"Valid 09x", "0912345678", true},
		{"Valid 03x", "0312345678", true},
		{"Valid +84", "+84912345678", true},
		{"Valid 84", "84912345678", true},
		{"Invalid prefix", "0112345678", false},
		{"Too short", "091234567", false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidVNPhone(tt.phone)
			if got != tt.expected {
				t.Errorf("IsValidVNPhone(%q) = %v, want %v", tt.phone, got, tt.expected)
			}
		})
	}
}

func TestIsValidFullName(t *testing.T) {
	tests := []struct {
		name     string
		fullName string
		expected bool
	}{
		{"Valid Vietnamese", "Nguyễn Văn A", true},
		{"Valid with dash", "Mary-Jane", true},
		{"Valid with apostrophe", "O'Connor", true},
		{"Too short", "A", false},
		{"Too long", "a" + string(make([]byte, 100)), false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidFullName(tt.fullName)
			if got != tt.expected {
				t.Errorf("IsValidFullName(%q) = %v, want %v", tt.fullName, got, tt.expected)
			}
		})
	}
}

func TestIsValidPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		expected bool
	}{
		{"Valid simple", "Pass123", true},
		{"Valid complex", "Abc@123#XYZ", true},
		{"Valid with dollar", "Pass123$", true},
		{"Invalid - no letter", "123456", false},
		{"Invalid - no digit", "Password", false},
		{"Invalid - too short", "Pass1", false},
		{"Invalid - forbidden char asterisk", "Pass123*", false},
		{"Invalid - forbidden char tilde", "Pass123~", false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidPassword(tt.password)
			if got != tt.expected {
				t.Errorf("IsValidPassword(%q) = %v, want %v", tt.password, got, tt.expected)
			}
		})
	}
}

func TestIsValidRoleForCreation(t *testing.T) {
	tests := []struct {
		name     string
		role     string
		expected bool
	}{
		{"Valid ADMIN", "ADMIN", true},
		{"Valid admin lowercase", "admin", true},
		{"Valid ORGANIZER", "ORGANIZER", true},
		{"Valid STAFF", "STAFF", true},
		{"Invalid STUDENT", "STUDENT", false},
		{"Invalid USER", "USER", false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsValidRoleForCreation(tt.role)
			if got != tt.expected {
				t.Errorf("IsValidRoleForCreation(%q) = %v, want %v", tt.role, got, tt.expected)
			}
		})
	}
}

func TestGetEmailError(t *testing.T) {
	tests := []struct {
		name  string
		email string
		want  string
	}{
		{"Valid email", "user@example.com", ""},
		{"Empty email", "", "Email không được để trống"},
		{"Invalid format", "invalid-email", "Email không hợp lệ. Ví dụ: user@example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetEmailError(tt.email)
			if got != tt.want {
				t.Errorf("GetEmailError(%q) = %q, want %q", tt.email, got, tt.want)
			}
		})
	}
}

func TestGetPasswordError(t *testing.T) {
	tests := []struct {
		name     string
		password string
		want     string
	}{
		{"Valid password", "Pass123", ""},
		{"Empty password", "", "Mật khẩu không được để trống"},
		{"Too short", "Pass1", "Mật khẩu phải có ít nhất 6 ký tự"},
		{"No letter", "123456", "Mật khẩu phải chứa ít nhất 1 chữ cái"},
		{"No digit", "Password", "Mật khẩu phải chứa ít nhất 1 chữ số"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetPasswordError(tt.password)
			if got != tt.want {
				t.Errorf("GetPasswordError(%q) = %q, want %q", tt.password, got, tt.want)
			}
		})
	}
}
