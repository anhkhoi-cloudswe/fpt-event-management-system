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
	AdminList     []User `json:"adminList"`
	StudentList   []User `json:"studentList"`
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

// Organization represents an organization / club entity
type Organization struct {
	OrgID       int       `json:"orgId" db:"org_id"`
	OrgName     string    `json:"orgName" db:"org_name"`
	OrgCode     string    `json:"orgCode" db:"org_code"`
	OrgType     string    `json:"orgType" db:"org_type"`
	CampusCode  string    `json:"campusCode" db:"campus_code"`
	LogoURL     *string   `json:"logoUrl" db:"logo_url"`
	Description *string   `json:"description" db:"description"`
	Status      string    `json:"status" db:"status"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// OrganizationRequest represents request payload for creating or updating an organization
type OrganizationRequest struct {
	OrgName     string  `json:"orgName"`
	OrgCode     string  `json:"orgCode"`
	OrgType     string  `json:"orgType"`
	CampusCode  string  `json:"campusCode"`
	LogoURL     *string `json:"logoUrl"`
	Description *string `json:"description"`
	Status      string  `json:"status"`
}

// BecomeOrganizerRequest represents payload for self-service role upgrade to ORGANIZER
type BecomeOrganizerRequest struct {
	Phone            string `json:"phone"`
	OrganizationName string `json:"organizationName"`
	OrgID            *int   `json:"orgId"`
	AgreePolicy      bool   `json:"agreePolicy"`
	RecaptchaToken   string `json:"recaptchaToken"`
}

// OrganizerOnboardRequest represents payload for unified organizer onboarding (Guest or existing Student)
type OrganizerOnboardRequest struct {
	Email            string `json:"email"`
	Password         string `json:"password"`
	FullName         string `json:"fullName"`
	Phone            string `json:"phone"`
	OrganizationName string `json:"organizationName"`
	OrgID            *int   `json:"orgId"`
	RecaptchaToken   string `json:"recaptchaToken"`
	ForceSendOTP     bool   `json:"forceSendOtp"` // If true, force send OTP even if password is not provided/wrong
	CheckOnly        bool   `json:"checkOnly"`    // If true, only check role/eligibility at Step 1 without sending OTP or upgrading
}

// OrganizerOnboardVerifyRequest represents payload to verify OTP and upgrade/create organizer
type OrganizerOnboardVerifyRequest struct {
	Email            string `json:"email"`
	OTP              string `json:"otp"`
	Phone            string `json:"phone"`
	FullName         string `json:"fullName"`
	OrganizationName string `json:"organizationName"`
	OrgID            *int   `json:"orgId"`
}


