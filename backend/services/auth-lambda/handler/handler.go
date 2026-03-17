package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/email"
	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/recaptcha"
	"github.com/fpt-event-services/common/response"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/auth-lambda/models"
	"github.com/fpt-event-services/services/auth-lambda/usecase"
	"golang.org/x/time/rate"
)

// Service instances (singleton)
var (
	emailService        *email.EmailService
	recaptchaService    *recaptcha.RecaptchaService
	log                 = logger.Default()
	servicesInitialized bool
	forgotPasswordGuard = newForgotPasswordLimiter()
)

type rateLimitEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type forgotPasswordLimiter struct {
	mu      sync.Mutex
	byEmail map[string]*rateLimitEntry
	byIP    map[string]*rateLimitEntry
}

func newForgotPasswordLimiter() *forgotPasswordLimiter {
	return &forgotPasswordLimiter{
		byEmail: make(map[string]*rateLimitEntry),
		byIP:    make(map[string]*rateLimitEntry),
	}
}

func (l *forgotPasswordLimiter) allow(email, ip string) bool {
	now := time.Now()
	emailKey := strings.ToLower(strings.TrimSpace(email))
	ipKey := strings.TrimSpace(ip)

	l.mu.Lock()
	defer l.mu.Unlock()

	l.cleanup(now)

	if emailKey != "" && !l.allowKey(l.byEmail, emailKey, now) {
		return false
	}

	if ipKey != "" && !l.allowKey(l.byIP, ipKey, now) {
		return false
	}

	return true
}

func (l *forgotPasswordLimiter) allowKey(store map[string]*rateLimitEntry, key string, now time.Time) bool {
	entry, ok := store[key]
	if !ok {
		entry = &rateLimitEntry{
			limiter: rate.NewLimiter(rate.Every(2*time.Minute), 1),
		}
		store[key] = entry
	}

	entry.lastSeen = now
	return entry.limiter.Allow()
}

func (l *forgotPasswordLimiter) cleanup(now time.Time) {
	if len(l.byEmail)+len(l.byIP) < 500 {
		return
	}

	staleAfter := 30 * time.Minute
	for key, entry := range l.byEmail {
		if now.Sub(entry.lastSeen) > staleAfter {
			delete(l.byEmail, key)
		}
	}
	for key, entry := range l.byIP {
		if now.Sub(entry.lastSeen) > staleAfter {
			delete(l.byIP, key)
		}
	}
}

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

// NewAuthHandlerWithDB creates a new auth handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewAuthHandlerWithDB(dbConn *sql.DB) *AuthHandler {
	return &AuthHandler{
		useCase: usecase.NewAuthUseCaseWithDB(dbConn),
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
	// Log which JWT secret is active (debug: helps verify Auth signs with same key as Gateway)
	log.Info(fmt.Sprintf("[Auth] HandleLogin — JWT_SECRET preview: %s****", jwt.GetSecretPreview()))

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

	tokenCookie := http.Cookie{
		Name:     "token",
		Value:    authResponse.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
	}

	// Return success payload without exposing JWT in JSON body
	resp := map[string]interface{}{
		"status": "success",
		"user":   authResponse.User,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
			"Set-Cookie":                  tokenCookie.String(),
		},
		Body: string(body),
	}, nil
}

// HandleMe handles GET /api/v1/auth/me
// Returns trusted user identity from JWT token stored in HttpOnly cookie.
func (h *AuthHandler) HandleMe(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authentication token")
	}

	claims, err := jwt.ValidateToken(token)
	if err != nil {
		return createErrorResponse(http.StatusUnauthorized, "Invalid authentication token")
	}

	resp := map[string]interface{}{
		"status": "success",
		"user": map[string]interface{}{
			"id":    claims.UserID,
			"email": claims.Email,
			"role":  claims.Role,
		},
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

// HandleLogout handles POST /api/logout
// It clears the HttpOnly token cookie on client side.
func (h *AuthHandler) HandleLogout(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	clearCookie := http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	}

	resp := map[string]interface{}{
		"status":  "success",
		"message": "Logged out",
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
			"Set-Cookie":                  clearCookie.String(),
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
	if token := extractTokenFromCookieHeader(request.Headers["Cookie"]); token != "" {
		return token
	}
	if token := extractTokenFromCookieHeader(request.Headers["cookie"]); token != "" {
		return token
	}

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

func extractTokenFromCookieHeader(cookieHeader string) string {
	if strings.TrimSpace(cookieHeader) == "" {
		return ""
	}

	parts := strings.Split(cookieHeader, ";")
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if !strings.HasPrefix(item, "token=") {
			continue
		}

		raw := strings.TrimPrefix(item, "token=")
		decoded, err := url.QueryUnescape(raw)
		if err != nil {
			return raw
		}
		return decoded
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

	clientIP := getClientIP(request)
	if !forgotPasswordGuard.allow(req.Email, clientIP) {
		return createStatusResponse(http.StatusTooManyRequests, "fail", "Too many requests. Vui lòng thử lại sau 2 phút")
	}

	// Verify reCAPTCHA (if configured)
	if req.RecaptchaToken != "" {
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

	// GỬI EMAIL VỚI OTP (Production-ready) - Dual path: notification API or local
	if err := sendOTPEmail(ctx, req.Email, otp, "forgot_password"); err != nil {
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

	// GỬI EMAIL VỚI OTP (Production-ready) - Dual path: notification API or local
	if err := sendOTPEmail(ctx, req.Email, otp, "register"); err != nil {
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

	// GỬI EMAIL VỚI OTP (Production-ready) - Dual path: notification API or local
	if err := sendOTPEmail(ctx, req.Email, otp, "register"); err != nil {
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

// ============================================================
// sendOTPEmail - Dual path: Notification API or local email service
// Phase 6: Tách Notification Service
// ============================================================
func sendOTPEmail(ctx context.Context, recipient, otp, purpose string) error {
	// Phase 6: Route through Notification Service API if enabled
	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		client := utils.NewInternalClient()
		notifyURL := utils.GetNotificationServiceURL() + "/internal/notify/email"

		payload := map[string]string{
			"to":      recipient,
			"type":    "otp",
			"otp":     otp,
			"purpose": purpose,
		}

		respBody, statusCode, err := client.Post(ctx, notifyURL, payload)
		if err != nil {
			log.Error("Notification API call failed, falling back to local email",
				"error", err, "email", recipient)
			// Fallback to local email service on API failure
			return emailService.SendOTPEmail(recipient, otp, purpose)
		}
		if statusCode != http.StatusOK {
			log.Warn("Notification API returned non-200, falling back to local email",
				"status", statusCode, "body", string(respBody), "email", recipient)
			return emailService.SendOTPEmail(recipient, otp, purpose)
		}

		log.Info("OTP email sent via Notification API", "email", recipient, "purpose", purpose)
		return nil
	}

	// Legacy path: use local email service directly
	return emailService.SendOTPEmail(recipient, otp, purpose)
}
