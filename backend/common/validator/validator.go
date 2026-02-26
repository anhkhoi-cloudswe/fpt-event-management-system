package validator

import (
	"regexp"
	"strings"
)

// Regex patterns - khớp 100% với ValidationUtil.java
var (
	// Email pattern - RFC 5322 simplified
	EmailPattern = regexp.MustCompile(`^[a-zA-Z0-9_+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$`)

	// Vietnamese phone pattern: (+84|84|0) + (3|5|7|8|9) + 8 digits
	PhonePattern = regexp.MustCompile(`^(\+84|84|0)(3|5|7|8|9)\d{8}$`)

	// Full name pattern: 2-100 chars, Unicode letters, spaces, dots, hyphens, apostrophes
	FullNamePattern = regexp.MustCompile(`^[\p{L} .'-]{2,100}$`)

	// Password pattern: min 6 chars, allowed characters only
	// Allowed: letters, digits, @#$%^&+=!-
	PasswordPattern = regexp.MustCompile(`^[A-Za-z\d@#$%^&+=!\-]{6,}$`)
)

// IsValidEmail validates email format (khớp ValidationUtil.isValidEmail)
func IsValidEmail(email string) bool {
	if email == "" {
		return false
	}
	return EmailPattern.MatchString(email)
}

// IsValidVNPhone validates Vietnamese phone number (khớp ValidationUtil.isValidVNPhone)
func IsValidVNPhone(phone string) bool {
	if phone == "" {
		return false
	}
	trimmed := strings.TrimSpace(phone)
	return PhonePattern.MatchString(trimmed)
}

// IsValidFullName validates full name (khớp ValidationUtil.isValidFullName)
func IsValidFullName(name string) bool {
	if name == "" {
		return false
	}
	trimmed := strings.TrimSpace(name)
	return FullNamePattern.MatchString(trimmed)
}

// IsValidPassword validates password strength (khớp ValidationUtil.isValidPassword)
func IsValidPassword(password string) bool {
	if password == "" {
		return false
	}
	if !PasswordPattern.MatchString(password) {
		return false
	}
	if !regexp.MustCompile(`[A-Za-z]`).MatchString(password) {
		return false
	}
	if !regexp.MustCompile(`\d`).MatchString(password) {
		return false
	}
	return true
}

// IsValidRoleForCreation validates role for account creation (khớp ValidationUtil.isValidRoleForCreation)
// Only ADMIN, ORGANIZER, STAFF are allowed
func IsValidRoleForCreation(role string) bool {
	if role == "" {
		return false
	}
	upperRole := strings.ToUpper(role)
	return upperRole == "ADMIN" || upperRole == "ORGANIZER" || upperRole == "STAFF"
}

// GetEmailError returns user-friendly error message for email
func GetEmailError(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "Email không được để trống"
	}
	if !IsValidEmail(trimmed) {
		return "Email không hợp lệ. Ví dụ: user@example.com"
	}
	return ""
}

// GetPhoneError returns user-friendly error message for phone
func GetPhoneError(phone string) string {
	trimmed := strings.TrimSpace(phone)
	if trimmed == "" {
		return "Số điện thoại không được để trống"
	}
	if !IsValidVNPhone(trimmed) {
		return "Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)"
	}
	return ""
}

// GetFullNameError returns user-friendly error message for full name
func GetFullNameError(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "Họ tên không được để trống"
	}
	if len(trimmed) < 2 {
		return "Họ tên phải có ít nhất 2 ký tự"
	}
	if len(trimmed) > 100 {
		return "Họ tên không được vượt quá 100 ký tự"
	}
	if !IsValidFullName(trimmed) {
		return "Họ tên chỉ được chứa chữ cái, khoảng trắng, dấu chấm, gạch ngang và dấu nháy đơn"
	}
	return ""
}

// GetPasswordError returns user-friendly error message for password
func GetPasswordError(password string) string {
	if password == "" {
		return "Mật khẩu không được để trống"
	}
	if len(password) < 6 {
		return "Mật khẩu phải có ít nhất 6 ký tự"
	}
	if !regexp.MustCompile(`[A-Za-z]`).MatchString(password) {
		return "Mật khẩu phải chứa ít nhất 1 chữ cái"
	}
	if !regexp.MustCompile(`\d`).MatchString(password) {
		return "Mật khẩu phải chứa ít nhất 1 chữ số"
	}
	if !IsValidPassword(password) {
		return "Mật khẩu chỉ được chứa chữ cái, số và ký tự đặc biệt (@#$%^&+=!-)"
	}
	return ""
}
