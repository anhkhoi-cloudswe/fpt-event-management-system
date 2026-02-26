package models

// ============================================================
// Password Reset Models - Quản lý OTP và đổi mật khẩu
// KHỚP VỚI Java ForgotPasswordJwtController & ResetPasswordJwtController
// ============================================================

// ForgotPasswordRequest - Request gửi OTP
type ForgotPasswordRequest struct {
	Email          string `json:"email"`
	RecaptchaToken string `json:"recaptchaToken"` // reCAPTCHA token for bot protection
}

// ResetPasswordRequest - Request đổi mật khẩu với OTP
type ResetPasswordRequest struct {
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	NewPassword string `json:"newPassword"`
}

// OTPRecord - Lưu thông tin OTP trong memory/cache
type OTPRecord struct {
	Email     string
	OTP       string
	ExpiresAt int64 // Unix timestamp
	Attempts  int   // Số lần nhập sai
	Used      bool  // Đã dùng chưa
}

// PasswordResetResponse - Response chung
type PasswordResetResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}
