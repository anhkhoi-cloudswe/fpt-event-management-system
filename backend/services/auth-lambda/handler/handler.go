package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/email"
	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/recaptcha"
	"github.com/fpt-event-services/common/response"
	"github.com/fpt-event-services/services/auth-lambda/models"
	"github.com/fpt-event-services/services/auth-lambda/usecase"
)

// Service instances (singleton)
var (
	emailService        *email.EmailService
	recaptchaService    *recaptcha.RecaptchaService
	log                 = logger.Default()
	servicesInitialized bool
)

// InitServices initializes email and recaptcha services
// Must be called after environment variables are loaded
func InitServices() {
	if servicesInitialized {
		return
	}
	emailService = email.NewEmailService(nil)
	recaptchaService = recaptcha.NewRecaptchaService(nil)
	servicesInitialized = true
	log.Info("Auth services initialized (email, recaptcha)")
}

// AuthHandler handles authentication requests
type AuthHandler struct {
	useCase *usecase.AuthUseCase
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler() *AuthHandler {
	return &AuthHandler{
		useCase: usecase.NewAuthUseCase(),
	}
}

// verifyRecaptcha verifies reCAPTCHA token if configured
func verifyRecaptcha(token, action, clientIP string) error {
	if !recaptchaService.IsConfigured() {
		log.Debug("reCAPTCHA not configured, skipping verification")
		return nil
	}

	result, err := recaptchaService.VerifyWithAction(token, action, clientIP)
	if err != nil {
		log.Error("reCAPTCHA verification error", "error", err)
		return err
	}
	if !result.Valid {
		log.Warn("reCAPTCHA verification failed", "message", result.ErrorMessage, "score", result.Score)
		return fmt.Errorf(result.ErrorMessage)
	}
	log.Debug("reCAPTCHA verified", "score", result.Score, "action", result.Action)
	return nil
}

// getClientIP extracts client IP from request headers
func getClientIP(request events.APIGatewayProxyRequest) string {
	if forwarded := request.Headers["X-Forwarded-For"]; forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	if ip := request.Headers["X-Real-IP"]; ip != "" {
		return ip
	}
	return request.RequestContext.Identity.SourceIP
}

// HandleLogin handles POST /api/login
func (h *AuthHandler) HandleLogin(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse request body
	var req models.LoginRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Execute login
	authResponse, err := h.useCase.Login(ctx, req)
	if err != nil {
		statusCode := http.StatusUnauthorized
		if err.Error() == "user is blocked" {
			statusCode = http.StatusForbidden
		}
		return createErrorResponse(statusCode, err.Error())
	}

	// Return format matching Java: {status: "success", user: {...}, token: "..."}
	resp := map[string]interface{}{
		"status": "success",
		"user":   authResponse.User,
		"token":  authResponse.Token,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

// HandleRegister handles POST /api/register
func (h *AuthHandler) HandleRegister(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse request body
	var req models.RegisterRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Execute registration
	authResponse, err := h.useCase.Register(ctx, req)
	if err != nil {
		statusCode := http.StatusBadRequest
		if err.Error() == "email already exists" {
			statusCode = http.StatusConflict
		}
		return createErrorResponse(statusCode, err.Error())
	}

	// Return format matching Java: {status: "success", user: {...}, token: "..."}
	resp := map[string]interface{}{
		"status": "success",
		"user":   authResponse.User,
		"token":  authResponse.Token,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

// HandleAdminCreateAccount handles POST /api/admin/create-account
func (h *AuthHandler) HandleAdminCreateAccount(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check authorization
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authorization token")
	}

	// Verify admin role
	if !jwt.IsAdmin(token) {
		return createErrorResponse(http.StatusForbidden, "Admin access required")
	}

	// Parse request body
	var req models.AdminCreateAccountRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Set default status if not provided
	if req.Status == "" {
		req.Status = "ACTIVE"
	}

	// Execute account creation
	user, err := h.useCase.AdminCreateAccount(ctx, req)
	if err != nil {
		log.Error("Failed to create account", "error", err)
		statusCode := http.StatusBadRequest
		if err.Error() == "email already exists" {
			statusCode = http.StatusConflict
		}
		return createErrorResponse(statusCode, err.Error())
	}

	return createSuccessResponse(http.StatusCreated, user)
}

// Helper functions

func extractToken(request events.APIGatewayProxyRequest) string {
	// Try Authorization header first
	if auth := request.Headers["Authorization"]; auth != "" {
		// Remove "Bearer " prefix
		if len(auth) > 7 && auth[:7] == "Bearer " {
			return auth[7:]
		}
	}

	// Fallback to lowercase
	if auth := request.Headers["authorization"]; auth != "" {
		if len(auth) > 7 && auth[:7] == "Bearer " {
			return auth[7:]
		}
	}

	return ""
}

func createSuccessResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	resp := response.SuccessResponse(data)
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

func createErrorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	resp := response.ErrorResponse(message)
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

// ============================================================
// HandleForgotPassword - POST /api/forgot-password
// Gửi OTP đặt lại mật khẩu qua email
// KHỚP VỚI Java ForgotPasswordJwtController
// PRODUCTION: Tích hợp reCAPTCHA + SMTP email
// ============================================================
func (h *AuthHandler) HandleForgotPassword(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse request body
	var req models.ForgotPasswordRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Email == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Email không được để trống")
	}

	// Verify reCAPTCHA (if configured)
	if req.RecaptchaToken != "" {
		clientIP := getClientIP(request)
		if err := verifyRecaptcha(req.RecaptchaToken, "forgot_password", clientIP); err != nil {
			log.Warn("reCAPTCHA failed for forgot-password", "email", req.Email, "error", err)
			return createStatusResponse(http.StatusForbidden, "fail", "Xác thực reCAPTCHA thất bại")
		}
	}

	// Generate OTP
	otp, err := h.useCase.ForgotPassword(ctx, req.Email)
	if err != nil {
		// Check specific error types
		if err.Error() == "email không tồn tại trong hệ thống" {
			return createStatusResponse(http.StatusNotFound, "fail", err.Error())
		}
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	// GỬI EMAIL VỚI OTP (Production-ready)
	if err := emailService.SendOTPEmail(req.Email, otp, "forgot_password"); err != nil {
		log.Error("Failed to send OTP email", "email", req.Email, "error", err)
		// Vẫn trả về success để không leak thông tin email tồn tại hay không
	}

	log.Info("OTP sent for forgot password", "email", req.Email)
	return createStatusResponse(http.StatusOK, "success", "Đã gửi OTP đặt lại mật khẩu tới email")
}

// ============================================================
// HandleResetPassword - POST /api/reset-password
// Xác thực OTP và đổi mật khẩu
// KHỚP VỚI Java ResetPasswordJwtController
// ============================================================
func (h *AuthHandler) HandleResetPassword(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse request body
	var req models.ResetPasswordRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	// Validate required fields
	if req.Email == "" || req.OTP == "" || req.NewPassword == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Vui lòng điền đầy đủ thông tin")
	}

	// Reset password
	err := h.useCase.ResetPassword(ctx, req)
	if err != nil {
		// Determine error type
		errMsg := err.Error()
		switch errMsg {
		case "email không tồn tại trong hệ thống":
			return createStatusResponse(http.StatusNotFound, "fail", errMsg)
		case "OTP không đúng", "OTP đã hết hạn", "OTP đã được sử dụng", "Đã nhập sai quá 5 lần, vui lòng yêu cầu OTP mới":
			return createStatusResponse(http.StatusUnauthorized, "fail", errMsg)
		default:
			return createStatusResponse(http.StatusBadRequest, "fail", errMsg)
		}
	}

	return createStatusResponse(http.StatusOK, "success", "Đổi mật khẩu thành công")
}

// createStatusResponse tạo response với format {status, message}
// KHỚP VỚI Java ForgotPassword và ResetPassword response format
func createStatusResponse(statusCode int, status, message string) (events.APIGatewayProxyResponse, error) {
	resp := map[string]string{
		"status":  status,
		"message": message,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

// ============================================================
// HandleRegisterSendOTP - POST /api/register/send-otp
// Register step 1 - Send OTP to email
// KHỚP VỚI Java RegisterJwtController sendOtp()
// PRODUCTION: Tích hợp reCAPTCHA + SMTP email
// ============================================================
func (h *AuthHandler) HandleRegisterSendOTP(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var req models.RegisterRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	// Validate required fields
	if req.Email == "" || req.Password == "" || req.FullName == "" || req.Phone == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Vui lòng điền đầy đủ thông tin")
	}

	// Verify reCAPTCHA (if provided)
	if req.RecaptchaToken != "" {
		clientIP := getClientIP(request)
		if err := verifyRecaptcha(req.RecaptchaToken, "register", clientIP); err != nil {
			log.Warn("reCAPTCHA failed for registration", "email", req.Email, "error", err)
			return createStatusResponse(http.StatusForbidden, "fail", "Xác thực reCAPTCHA thất bại")
		}
	}

	// Check email exists
	exists, err := h.useCase.CheckEmailExists(ctx, req.Email)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", err.Error())
	}
	if exists {
		return createStatusResponse(http.StatusConflict, "fail", "Email đã tồn tại trong hệ thống")
	}

	// Generate and send OTP
	otp, err := h.useCase.GenerateRegisterOTP(ctx, req)
	if err != nil {
		return createStatusResponse(http.StatusBadGateway, "fail", "Không thể gửi OTP")
	}

	// GỬI EMAIL VỚI OTP (Production-ready)
	if err := emailService.SendOTPEmail(req.Email, otp, "register"); err != nil {
		log.Error("Failed to send registration OTP email", "email", req.Email, "error", err)
		// Continue anyway to not block registration flow in dev mode
	}

	log.Info("Registration OTP sent", "email", req.Email)
	return createStatusResponse(http.StatusOK, "success", "Đã gửi OTP tới email")
}

// ============================================================
// HandleRegisterVerifyOTP - POST /api/register/verify-otp
// Register step 2 - Verify OTP and create account
// KHỚP VỚI Java RegisterJwtController verifyOtp()
// ============================================================
func (h *AuthHandler) HandleRegisterVerifyOTP(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var req models.VerifyOtpRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Email == "" || req.OTP == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Email và OTP không được để trống")
	}

	// Verify OTP and create user
	authResponse, err := h.useCase.VerifyRegisterOTP(ctx, req.Email, req.OTP)
	if err != nil {
		errMsg := err.Error()
		switch errMsg {
		case "OTP không đúng", "OTP đã hết hạn":
			return createStatusResponse(http.StatusBadRequest, "fail", errMsg)
		case "Email đã tồn tại":
			return createStatusResponse(http.StatusConflict, "fail", errMsg)
		default:
			return createStatusResponse(http.StatusBadRequest, "fail", errMsg)
		}
	}

	// Return format matching Java: {status: "success", user: {...}, token: "..."}
	resp := map[string]interface{}{
		"status": "success",
		"user":   authResponse.User,
		"token":  authResponse.Token,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}

// ============================================================
// HandleRegisterResendOTP - POST /api/register/resend-otp
// Resend OTP for pending registration
// KHỚP VỚI Java RegisterJwtController resendOtp()
// ============================================================
func (h *AuthHandler) HandleRegisterResendOTP(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var req models.ResendOtpRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Email == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Email không được để trống")
	}

	// Resend OTP
	otp, err := h.useCase.ResendRegisterOTP(ctx, req.Email)
	if err != nil {
		errMsg := err.Error()
		switch errMsg {
		case "Không có đăng ký đang chờ cho email này":
			return createStatusResponse(http.StatusBadRequest, "fail", errMsg)
		case "Quá nhiều lần gửi lại":
			return createStatusResponse(http.StatusTooManyRequests, "fail", errMsg)
		default:
			return createStatusResponse(http.StatusBadGateway, "fail", "Không thể gửi OTP")
		}
	}

	// GỬI EMAIL VỚI OTP (Production-ready)
	if err := emailService.SendOTPEmail(req.Email, otp, "register"); err != nil {
		log.Error("Failed to resend registration OTP email", "email", req.Email, "error", err)
	}

	log.Info("Registration OTP resent", "email", req.Email)
	return createStatusResponse(http.StatusOK, "success", "Đã gửi lại OTP")
}

// ============================================================
// HandleAdminUpdateUser - PUT /api/admin/create-account
// Update user (fullName, phone, role, status, optional password)
// KHỚP VỚI Java AdminController updateUser()
// ============================================================
func (h *AuthHandler) HandleAdminUpdateUser(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check authorization
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authorization token")
	}

	// Verify admin role
	if !jwt.IsAdmin(token) {
		return createErrorResponse(http.StatusForbidden, "Admin access required")
	}

	// Parse request body
	var req models.AdminUpdateUserRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Invalid request body")
	}

	if req.ID == 0 {
		return createErrorResponse(http.StatusBadRequest, "ID không hợp lệ")
	}

	// Update user
	err := h.useCase.AdminUpdateUser(ctx, req)
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Cập nhật thành công")
}

// ============================================================
// HandleAdminDeleteUser - DELETE /api/admin/create-account
// Soft delete user (status -> INACTIVE)
// KHỚP VỚI Java AdminController deleteUser()
// ============================================================
func (h *AuthHandler) HandleAdminDeleteUser(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check authorization
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authorization token")
	}

	// Verify admin role
	if !jwt.IsAdmin(token) {
		return createErrorResponse(http.StatusForbidden, "Admin access required")
	}

	// Get user ID from query params
	userID := request.QueryStringParameters["id"]
	if userID == "" {
		return createErrorResponse(http.StatusBadRequest, "Missing user ID")
	}

	// Soft delete user
	err := h.useCase.AdminDeleteUser(ctx, userID)
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Xóa user thành công")
}

// ============================================================
// HandleGetStaffOrganizer - GET /api/users/staff-organizer
// Get STAFF and ORGANIZER users (2 lists)
// KHỚP VỚI Java AdminController getStaffOrganizer()
// ============================================================
func (h *AuthHandler) HandleGetStaffOrganizer(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check authorization
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authorization token")
	}

	// Verify admin role
	if !jwt.IsAdmin(token) {
		return createErrorResponse(http.StatusForbidden, "Admin access required")
	}

	// Get staff and organizer lists
	result, err := h.useCase.GetStaffAndOrganizers(ctx)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, err.Error())
	}

	// Return data directly without wrapping (to match Java format)
	body, _ := json.Marshal(result)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(body),
	}, nil
}
