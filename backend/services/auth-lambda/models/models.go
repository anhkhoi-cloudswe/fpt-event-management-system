package models

import "time"

// User represents a user in the system
type User struct {
	ID           int       `json:"id" db:"user_id"`
	FullName     string    `json:"fullName" db:"full_name"`
	Email        string    `json:"email" db:"email"`
	Phone        string    `json:"phone" db:"phone"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Role         string    `json:"role" db:"role"`
	Status       string    `json:"status" db:"status"`
	Wallet       float64   `json:"wallet" db:"Wallet"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at"`
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
	Token string `json:"token"`
	User  User   `json:"user"`
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
