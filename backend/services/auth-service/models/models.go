package models

import "time"

// User represents a user in the system
// OPTIMIZED: Wallet field removed - balance is now fetched from dedicated wallets table via GetUserWalletBalance
type User struct {
	ID           int        `json:"id" db:"user_id"`
	FullName     string     `json:"fullName" db:"full_name"`
	Email        string     `json:"email" db:"email"`
	Phone        string     `json:"phone" db:"phone"`
	PasswordHash string     `json:"-" db:"password_hash"`
	Role         string     `json:"role" db:"role"`
	Status       string     `json:"status" db:"status"`
	CreatedAt    time.Time  `json:"createdAt" db:"created_at"`
	SSOProvider  *string    `json:"ssoProvider" db:"sso_provider"`
	DeletedAt    *time.Time `json:"deletedAt" db:"deleted_at"`
	Theme        string     `json:"theme" db:"theme"`
	Language     string     `json:"language" gorm:"column:language;default:vi" db:"language"`
	// Wallet field removed - balance now queried from wallets table for O(1) lookup
}

// LoginRequest represents login request body
type LoginRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	RecaptchaToken string `json:"recaptchaToken"`
}

// RegisterRequest represents register request body
type RegisterRequest struct {
	FullName       string `json:"fullName"`
	Phone          string `json:"phone"`
	Email          string `json:"email"`
	Password       string `json:"password"`
	RecaptchaToken string `json:"recaptchaToken"`
}

// AdminCreateAccountRequest represents admin create account request
type AdminCreateAccountRequest struct {
	FullName string `json:"fullName"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

// AuthResponse represents authentication response
type AuthResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"-"`
	User         User   `json:"user"`
	IsNewUser    bool   `json:"is_new_user"`
}

// GoogleCallbackRequest represents the payload from frontend Google sign-in
type GoogleCallbackRequest struct {
	Code        string `json:"code,omitempty"`
	Credential  string `json:"credential,omitempty"`
	RedirectURI string `json:"redirectUri,omitempty"`
}

// UpdatePasswordRequest represents direct password update payload
type UpdatePasswordRequest struct {
	OldPassword string `json:"oldPassword"`
	Password    string `json:"password"`
}

// VerifyOtpRequest represents OTP verification request
type VerifyOtpRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

// ResendOtpRequest represents resend OTP request
type ResendOtpRequest struct {
	Email string `json:"email"`
}

// AdminUpdateUserRequest represents admin update user request
type AdminUpdateUserRequest struct {
	ID       int    `json:"id"`
	FullName string `json:"fullName"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
	Status   string `json:"status"`
	Password string `json:"password,omitempty"`
}

// StaffOrganizerResponse represents response with staff and organizer lists
type StaffOrganizerResponse struct {
	StaffList     []User `json:"staffList"`
	OrganizerList []User `json:"organizerList"`
}

// PendingRegistration represents a pending registration with OTP
type PendingRegistration struct {
	Email        string    `json:"email"`
	FullName     string    `json:"fullName"`
	Phone        string    `json:"phone"`
	PasswordHash string    `json:"-"`
	OTP          string    `json:"-"`
	ExpiresAt    time.Time `json:"-"`
	Attempts     int       `json:"-"`
}
