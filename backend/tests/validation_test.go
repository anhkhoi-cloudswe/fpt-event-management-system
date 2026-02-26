package tests

import (
	"testing"

	"github.com/fpt-event-services/common/validator"
)

// ============================================================
// Test: Email Validation
// ============================================================

func TestEmailValidation(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		valid    bool
		errorMsg string
	}{
		// Valid emails
		{"Valid FPT email", "user@fpt.edu.vn", true, ""},
		{"Valid Gmail", "user@gmail.com", true, ""},
		{"Valid with numbers", "user123@example.com", true, ""},
		{"Valid with dots", "first.last@example.com", true, ""},
		{"Valid with plus", "user+tag@example.com", true, ""},
		{"Valid subdomain", "user@mail.example.com", true, ""},

		// Invalid emails
		{"Empty email", "", false, "Email không được để trống"},
		{"Missing @", "userexample.com", false, "Email không hợp lệ"},
		{"Missing domain", "user@", false, "Email không hợp lệ"},
		{"Missing user", "@example.com", false, "Email không hợp lệ"},
		{"Double @", "user@@example.com", false, "Email không hợp lệ"},
		{"Space in email", "user @example.com", false, "Email không hợp lệ"},
		{"Invalid chars", "user<script>@example.com", false, "Email không hợp lệ"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := validator.IsValidEmail(tt.email)
			if isValid != tt.valid {
				t.Errorf("IsValidEmail(%q) = %v, want %v", tt.email, isValid, tt.valid)
			}

			errMsg := validator.GetEmailError(tt.email)
			if tt.valid && errMsg != "" {
				t.Errorf("GetEmailError(%q) = %q, want empty", tt.email, errMsg)
			}
			if !tt.valid && errMsg == "" {
				t.Errorf("GetEmailError(%q) = empty, want error message", tt.email)
			}
		})
	}
}

// ============================================================
// Test: Phone Validation
// ============================================================

func TestPhoneValidation(t *testing.T) {
	tests := []struct {
		name  string
		phone string
		valid bool
	}{
		// Valid Vietnamese phone numbers
		{"Valid 10 digits starting 09", "0912345678", true},
		{"Valid 10 digits starting 03", "0312345678", true},
		{"Valid 10 digits starting 07", "0712345678", true},
		{"Valid 10 digits starting 08", "0812345678", true},
		{"Valid 10 digits starting 05", "0512345678", true},

		// Invalid phone numbers
		{"Empty phone", "", false},
		{"Too short", "091234567", false},
		{"Too long", "09123456789", false},
		{"Letters included", "091234567a", false},
		{"Not starting with 0", "9123456789", false},
		{"Special chars", "091-234-567", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := validator.IsValidVNPhone(tt.phone)
			if isValid != tt.valid {
				t.Errorf("IsValidVNPhone(%q) = %v, want %v", tt.phone, isValid, tt.valid)
			}
		})
	}
}

// ============================================================
// Test: Password Validation
// ============================================================

func TestPasswordValidation(t *testing.T) {
	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		// Valid passwords
		{"Min 6 chars", "abc123", true},
		{"Longer password", "mySecurePassword123", true},
		{"With special chars", "Pass@word123!", true},

		// Invalid passwords
		{"Empty", "", false},
		{"Too short (5 chars)", "abc12", false},
		{"Only spaces", "      ", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errMsg := validator.GetPasswordError(tt.password)
			if tt.valid && errMsg != "" {
				t.Errorf("GetPasswordError(%q) should be empty, got %q", tt.password, errMsg)
			}
			if !tt.valid && errMsg == "" {
				t.Errorf("GetPasswordError(%q) should return error", tt.password)
			}
		})
	}
}

// ============================================================
// Test: Full Name Validation
// ============================================================

func TestFullNameValidation(t *testing.T) {
	tests := []struct {
		name     string
		fullName string
		valid    bool
	}{
		// Valid names
		{"Vietnamese name", "Nguyễn Văn An", true},
		{"Simple name", "John Doe", true},
		{"Single name", "Admin", true},
		{"Name with hyphen", "Jean-Pierre", true},

		// Invalid names
		{"Empty", "", false},
		{"Too short", "A", false},
		{"Numbers only", "12345", false},
		{"Special chars", "User@#$", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errMsg := validator.GetFullNameError(tt.fullName)
			if tt.valid && errMsg != "" {
				t.Errorf("GetFullNameError(%q) should be empty, got %q", tt.fullName, errMsg)
			}
			if !tt.valid && errMsg == "" {
				t.Errorf("GetFullNameError(%q) should return error", tt.fullName)
			}
		})
	}
}

// ============================================================
// Test: Role Validation
// ============================================================

func TestRoleValidation(t *testing.T) {
	tests := []struct {
		name  string
		role  string
		valid bool
	}{
		{"ADMIN role", "ADMIN", true},
		{"ORGANIZER role", "ORGANIZER", true},
		{"STAFF role", "STAFF", true},
		{"STUDENT role (not for creation)", "STUDENT", false},
		{"Invalid role", "SUPERADMIN", false},
		{"Lowercase admin (case insensitive)", "admin", true},
		{"Mixed case Organizer", "Organizer", true},
		{"Empty role", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isValid := validator.IsValidRoleForCreation(tt.role)
			if isValid != tt.valid {
				t.Errorf("IsValidRoleForCreation(%q) = %v, want %v", tt.role, isValid, tt.valid)
			}
		})
	}
}

// ============================================================
// Benchmark tests
// ============================================================

func BenchmarkEmailValidation(b *testing.B) {
	emails := []string{
		"user@example.com",
		"invalid-email",
		"user@fpt.edu.vn",
		"",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, email := range emails {
			validator.IsValidEmail(email)
		}
	}
}

func BenchmarkPhoneValidation(b *testing.B) {
	phones := []string{
		"0912345678",
		"091234567",
		"",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, phone := range phones {
			validator.IsValidVNPhone(phone)
		}
	}
}
