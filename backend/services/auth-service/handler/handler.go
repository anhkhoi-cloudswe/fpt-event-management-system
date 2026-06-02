package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
	"github.com/fpt-event-services/common/timeutil"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/common/validator"
	"github.com/fpt-event-services/services/auth-service/models"
	"github.com/fpt-event-services/services/auth-service/usecase"
	"golang.org/x/time/rate"
)

// Service instances (singleton)
var (
	emailService        *email.EmailService
	recaptchaService    *recaptcha.RecaptchaService
	log                 = logger.Default()
	servicesInitialized bool
	forgotPasswordGuard = newForgotPasswordLimiter()
	registerGuard       = newForgotPasswordLimiter() // reuse same struct, independent state
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
	now := timeutil.GetNow()
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

// retryAfterSeconds returns how many seconds until the limiter allows the next request.
// It peeks at the reservation without consuming a token.
func (l *forgotPasswordLimiter) retryAfterSeconds(key string, store map[string]*rateLimitEntry) int {
	entry, ok := store[key]
	if !ok {
		return 120 // default 2 min window
	}
	res := entry.limiter.Reserve()
	res.Cancel() // don't consume the token
	d := res.Delay()
	if d <= 0 {
		return 120
	}
	sec := int(d.Seconds()) + 1 // +1 to round up
	if sec > 120 {
		sec = 120
	}
	return sec
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
	if recaptchaService == nil {
		log.Warn("reCAPTCHA service is not initialized, skipping verification")
		return nil
	}
	if !recaptchaService.IsConfigured() {
		log.Debug("reCAPTCHA not configured, skipping verification")
		return nil
	}

	result, err := recaptchaService.VerifyWithAction(token, action, clientIP)
	if err != nil {
		log.Error("reCAPTCHA verification error", "error", err)
		return err
	}
	if result == nil {
		log.Error("reCAPTCHA verification returned nil result")
		return fmt.Errorf("empty recaptcha response")
	}
	if !result.Valid {
		log.Warn("reCAPTCHA verification failed", "message", result.ErrorMessage, "score", result.Score)
		return fmt.Errorf("%s", result.ErrorMessage)
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

// getScheme extracts request scheme (http/https) from X-Forwarded-Proto header
// Used when running behind load balancer (ALB/API Gateway)
func getScheme(request events.APIGatewayProxyRequest) string {
	if proto := request.Headers["X-Forwarded-Proto"]; proto != "" {
		return strings.ToLower(strings.TrimSpace(proto))
	}
	if proto := request.Headers["x-forwarded-proto"]; proto != "" {
		return strings.ToLower(strings.TrimSpace(proto))
	}
	// Default to https in production for safety
	return "https"
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
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}

	// Return success payload without exposing JWT in JSON body
	resp := map[string]interface{}{
		"status":      "success",
		"user":        authResponse.User,
		"is_new_user": authResponse.IsNewUser,
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
// OPTIMIZED: Now fetches wallet balance from dedicated wallets table for O(1) lookup
func (h *AuthHandler) HandleMe(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authentication token")
	}

	claims, err := jwt.ValidateToken(token)
	if err != nil {
		return createErrorResponse(http.StatusUnauthorized, "Invalid authentication token")
	}

	user, err := h.useCase.GetUserByEmail(ctx, claims.Email)
	if err != nil || user == nil {
		return createErrorResponse(http.StatusUnauthorized, "User not found")
	}

	// Fetch wallet balance from dedicated wallets table (O(1) lookup)
	walletBalance, err := h.useCase.GetUserWalletBalance(ctx, claims.Email)
	if err != nil {
		logger.Warn(`[HandleMe] Failed to fetch wallet balance for user ` + claims.Email + `: ` + err.Error())
		// Return 0 balance if wallet not found - not an authentication error
		walletBalance = 0
	}

	resp := map[string]interface{}{
		"status": "success",
		"user": map[string]interface{}{
			"id":          user.ID,
			"fullName":    user.FullName,
			"email":       user.Email,
			"phone":       user.Phone,
			"role":        user.Role,
			"status":      user.Status,
			"createdAt":   user.CreatedAt.Format(time.RFC3339),
			"ssoProvider": user.SSOProvider,
			"theme":       user.Theme,
			"wallet":      walletBalance, // Balance from dedicated wallets table
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
		Secure:   true,
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

// HandleRegister handles POST /api/register - DISABLED to prevent OTP bypass
func (h *AuthHandler) HandleRegister(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log.Warn("Direct registration attempt rejected to prevent OTP bypass")
	return createErrorResponse(http.StatusForbidden, "Đăng ký trực tiếp đã bị vô hiệu hóa để bảo mật. Vui lòng sử dụng quy trình xác thực OTP tại /api/register/send-otp")
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

	emailKey := strings.ToLower(strings.TrimSpace(req.Email))
	ipKey := strings.TrimSpace(clientIP)

	if !forgotPasswordGuard.allow(req.Email, clientIP) {
		forgotPasswordGuard.mu.Lock()
		retryAfter := forgotPasswordGuard.retryAfterSeconds(emailKey, forgotPasswordGuard.byEmail)
		if ra := forgotPasswordGuard.retryAfterSeconds(ipKey, forgotPasswordGuard.byIP); ra > retryAfter {
			retryAfter = ra
		}
		forgotPasswordGuard.mu.Unlock()
		return createRateLimitResponse(fmt.Sprintf("Quá nhiều yêu cầu. Vui lòng thử lại sau %d giây.", retryAfter), retryAfter)
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

	// GỬI EMAIL VỚI OTP (Production-ready) - Asynchronous to prevent synchronous network hangs
	go func() {
		bgCtx := context.Background()
		if err := sendOTPEmail(bgCtx, req.Email, otp, "forgot_password"); err != nil {
			log.Error("Failed to send OTP email in background", "email", req.Email, "error", err)
		}
	}()

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

// createRateLimitResponse returns a 429 response with retry_after field so
// the frontend can render a live countdown without additional server calls.
func createRateLimitResponse(message string, retryAfterSec int) (events.APIGatewayProxyResponse, error) {
	resp := map[string]interface{}{
		"status":      "error",
		"message":     message,
		"retry_after": retryAfterSec,
	}
	body, _ := json.Marshal(resp)

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusTooManyRequests,
		Headers: map[string]string{
			"Content-Type":                "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin": "*",
			"Retry-After":                 fmt.Sprintf("%d", retryAfterSec),
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
func (h *AuthHandler) HandleRegisterSendOTP(ctx context.Context, request events.APIGatewayProxyRequest) (resp events.APIGatewayProxyResponse, err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Error("CRITICAL PANIC recovered in HandleRegisterSendOTP", "panic", r)
			resp, err = createStatusResponse(http.StatusInternalServerError, "fail", "Đã xảy ra lỗi hệ thống nghiêm trọng")
		}
	}()

	var req models.RegisterRequest
	if err = json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	// Validate required fields
	if req.Email == "" || req.Password == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Vui lòng điền đầy đủ thông tin")
	}
	if strings.TrimSpace(req.FullName) == "" {
		parts := strings.Split(req.Email, "@")
		if len(parts) > 0 {
			req.FullName = validator.SanitizeFullNamePlaceholder(parts[0])
		}
	}

	// Rate-limit per email + IP using registerGuard
	clientIP2 := getClientIP(request)
	emailKey2 := strings.ToLower(strings.TrimSpace(req.Email))
	ipKey2 := strings.TrimSpace(clientIP2)
	if !registerGuard.allow(req.Email, clientIP2) {
		registerGuard.mu.Lock()
		retryAfter := registerGuard.retryAfterSeconds(emailKey2, registerGuard.byEmail)
		if ra := registerGuard.retryAfterSeconds(ipKey2, registerGuard.byIP); ra > retryAfter {
			retryAfter = ra
		}
		registerGuard.mu.Unlock()
		return createRateLimitResponse(fmt.Sprintf("Quá nhiều yêu cầu. Vui lòng thử lại sau %d giây.", retryAfter), retryAfter)
	}

	// Verify reCAPTCHA (if provided)
	if req.RecaptchaToken != "" {
		clientIP := getClientIP(request)
		if err := verifyRecaptcha(req.RecaptchaToken, "register", clientIP); err != nil {
			log.Error("reCAPTCHA failed for registration", "email", req.Email, "error", err)
			return createStatusResponse(http.StatusBadRequest, "fail", "Xác thực reCAPTCHA không hợp lệ")
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
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	// GỬI EMAIL VỚI OTP (Production-ready) - Asynchronous to prevent synchronous network hangs
	go func() {
		bgCtx := context.Background()
		if err := sendOTPEmail(bgCtx, req.Email, otp, "register_otp"); err != nil {
			log.Error("Failed to send registration OTP email in background", "email", req.Email, "error", err)
		}
	}()

	log.Info("Registration OTP sent", "email", req.Email)
	return createStatusResponse(http.StatusOK, "success", "Đã gửi OTP tới email")
}

// ============================================================
// HandleRegisterVerifyOTP - POST /api/register/verify-otp
// Register step 2 - Verify OTP and create account
// KHỚP VỚI Java RegisterJwtController verifyOtp()
// ============================================================
func (h *AuthHandler) HandleRegisterVerifyOTP(ctx context.Context, request events.APIGatewayProxyRequest) (resp events.APIGatewayProxyResponse, err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Error("CRITICAL PANIC recovered in HandleRegisterVerifyOTP", "panic", r)
			resp, err = createStatusResponse(http.StatusInternalServerError, "fail", "Đã xảy ra lỗi hệ thống nghiêm trọng")
		}
	}()

	var req models.VerifyOtpRequest
	if err = json.Unmarshal([]byte(request.Body), &req); err != nil {
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

	tokenCookie := http.Cookie{
		Name:     "token",
		Value:    authResponse.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}

	// Return format matching Java: {status: "success", user: {...}, token: "..."}
	responseMap := map[string]interface{}{
		"status": "success",
		"user":   authResponse.User,
		"token":  authResponse.Token,
	}
	body, _ := json.Marshal(responseMap)

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

	// GỬI EMAIL VỚI OTP (Production-ready) - Asynchronous to prevent synchronous network hangs
	go func() {
		bgCtx := context.Background()
		if err := sendOTPEmail(bgCtx, req.Email, otp, "register_otp"); err != nil {
			log.Error("Failed to resend registration OTP email in background", "email", req.Email, "error", err)
		}
	}()

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
		baseURL := config.MustGetServiceURLWithFallback("Notification", "NOTIFICATION_SERVICE_URL", 8086)
		notifyURL := strings.TrimSuffix(baseURL, "/") + "/internal/notify/email"

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

// HandleGoogleCallback handles Google OAuth callback and signs in/registers the user
func (h *AuthHandler) HandleGoogleCallback(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var req models.GoogleCallbackRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Invalid request body")
	}

	if req.Code == "" {
		return createErrorResponse(http.StatusBadRequest, "Code is required")
	}

	// 1. Google OAuth Token Exchange
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURI := req.RedirectURI
	if redirectURI == "" {
		redirectURI = "postmessage" // default for react-oauth/google popup flow
	}

	tokenURL := "https://oauth2.googleapis.com/token"
	data := url.Values{}
	data.Set("code", req.Code)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("redirect_uri", redirectURI)
	data.Set("grant_type", "authorization_code")

	resp, err := http.PostForm(tokenURL, data)
	if err != nil {
		log.Error("Failed to request token from Google: %v", err)
		return createErrorResponse(http.StatusBadGateway, "Failed to exchange code with Google")
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Failed to read Google token response")
	}

	if resp.StatusCode != http.StatusOK {
		log.Error("Google token exchange returned status %d: %s", resp.StatusCode, string(respBody))
		return createErrorResponse(http.StatusUnauthorized, "Invalid Google authorization code")
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(respBody, &tokenResp); err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Failed to parse token response")
	}

	// 2. Fetch Google User Profile
	userInfoURL := "https://www.googleapis.com/oauth2/v3/userinfo"
	reqProfile, err := http.NewRequest("GET", userInfoURL, nil)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Failed to create profile request")
	}
	reqProfile.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	client := &http.Client{}
	respProfile, err := client.Do(reqProfile)
	if err != nil {
		log.Error("Failed to fetch profile from Google: %v", err)
		return createErrorResponse(http.StatusBadGateway, "Failed to fetch user profile from Google")
	}
	defer respProfile.Body.Close()

	profileBody, err := io.ReadAll(respProfile.Body)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Failed to read Google profile response")
	}

	if respProfile.StatusCode != http.StatusOK {
		log.Error("Google profile request returned status %d: %s", respProfile.StatusCode, string(profileBody))
		return createErrorResponse(http.StatusUnauthorized, "Failed to fetch user info from Google")
	}

	var googleUser struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(profileBody, &googleUser); err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Failed to parse Google user info")
	}

	if googleUser.Email == "" {
		return createErrorResponse(http.StatusBadRequest, "Google profile does not contain email")
	}

	// 3. Process Login/Registration
	authResponse, err := h.useCase.LoginOrRegisterGoogle(ctx, googleUser.Email, googleUser.Name)
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	// 4. Set HttpOnly Cookie & Return Payload
	tokenCookie := http.Cookie{
		Name:     "token",
		Value:    authResponse.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}

	respPayload := map[string]interface{}{
		"status":      "success",
		"user":        authResponse.User,
		"is_new_user": authResponse.IsNewUser,
		"token":       authResponse.Token, // Include token in body for standard client local storage fallbacks
	}
	body, _ := json.Marshal(respPayload)

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

// HandleUpdatePhone handles POST /api/auth/update-phone for authenticated users
func (h *AuthHandler) HandleUpdatePhone(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract the trusted email from headers injected by JWT middleware
	email := request.Headers["X-User-Email"]
	if email == "" {
		token := extractToken(request)
		if token != "" {
			claims, err := jwt.ValidateToken(token)
			if err == nil {
				email = claims.Email
			}
		}
	}
	if email == "" {
		return createErrorResponse(http.StatusUnauthorized, "User is not authenticated")
	}

	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Phone == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Số điện thoại không được để trống")
	}

	// Call use case to update phone directly
	err := h.useCase.DirectUpdatePhone(ctx, email, req.Phone)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Cập nhật số điện thoại thành công")
}

// HandleUpdatePassword handles POST /api/auth/update-password for authenticated users
func (h *AuthHandler) HandleUpdatePassword(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract the trusted email from headers injected by JWT middleware
	email := request.Headers["X-User-Email"]
	if email == "" {
		return createErrorResponse(http.StatusUnauthorized, "User is not authenticated")
	}

	var req models.UpdatePasswordRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Password == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mật khẩu không được để trống")
	}

	// Call use case to update password directly without OTP
	err := h.useCase.DirectUpdatePassword(ctx, email, req.Password)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Cập nhật mật khẩu thành công")
}

// HandleCloseAccount handles POST /api/auth/close-account to soft-delete an account
func (h *AuthHandler) HandleCloseAccount(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authentication token")
	}

	claims, err := jwt.ValidateToken(token)
	if err != nil {
		return createErrorResponse(http.StatusUnauthorized, "Invalid authentication token")
	}

	err = h.useCase.CloseAccount(ctx, claims.UserID)
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	// Clear HttpOnly token cookie
	clearCookie := http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	}

	resp := map[string]interface{}{
		"status":  "success",
		"message": "Tài khoản của bạn đã được đưa vào hàng đợi xóa. Bạn có 30 ngày để khôi phục trước khi bị xóa vĩnh viễn.",
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

// HandleRestoreAccount handles POST /api/auth/restore-account to recover a PENDING_DELETE account
func (h *AuthHandler) HandleRestoreAccount(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authentication token")
	}

	claims, err := jwt.ValidateToken(token)
	if err != nil {
		return createErrorResponse(http.StatusUnauthorized, "Invalid authentication token")
	}

	err = h.useCase.RestoreAccount(ctx, claims.UserID)
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Khôi phục tài khoản thành công")
}

// HandleSetSSOPassword handles POST /api/auth/set-sso-password for single sign-on users setting their password
func (h *AuthHandler) HandleSetSSOPassword(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	token := extractToken(request)
	if token == "" {
		return createErrorResponse(http.StatusUnauthorized, "Missing authentication token")
	}

	claims, err := jwt.ValidateToken(token)
	if err != nil {
		return createErrorResponse(http.StatusUnauthorized, "Invalid authentication token")
	}

	var req models.UpdatePasswordRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.Password == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mật khẩu không được để trống")
	}

	err = h.useCase.SetSSOUserPassword(ctx, claims.Email, req.Password)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Thiết lập mật khẩu thành công. Từ giờ bạn có thể đăng nhập bằng mật khẩu này.")
}

// SweepExpiredAccounts invokes hard deletion of expired users
func (h *AuthHandler) SweepExpiredAccounts(ctx context.Context) (int64, error) {
	return h.useCase.HardDeleteExpiredAccounts(ctx)
}

// HandleUpdateTheme handles POST /api/auth/update-theme to save theme preference
func (h *AuthHandler) HandleUpdateTheme(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	email := request.Headers["X-User-Email"]
	if email == "" {
		token := extractToken(request)
		if token != "" {
			claims, err := jwt.ValidateToken(token)
			if err == nil {
				email = claims.Email
			}
		}
	}
	if email == "" {
		return createErrorResponse(http.StatusUnauthorized, "User is not authenticated")
	}

	var req struct {
		Theme string `json:"theme"`
	}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	err := h.useCase.UpdateTheme(ctx, email, req.Theme)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Cập nhật giao diện thành công")
}

// HandleUpdateProfile handles POST /api/auth/update-profile to save profile info (fullName, etc.)
func (h *AuthHandler) HandleUpdateProfile(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	email := request.Headers["X-User-Email"]
	if email == "" {
		token := extractToken(request)
		if token != "" {
			claims, err := jwt.ValidateToken(token)
			if err == nil {
				email = claims.Email
			}
		}
	}
	if email == "" {
		return createErrorResponse(http.StatusUnauthorized, "User is not authenticated")
	}

	var req struct {
		FullName string `json:"fullName"`
	}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	// If fullName is provided, update it
	if req.FullName != "" {
		err := h.useCase.UpdateFullName(ctx, email, req.FullName)
		if err != nil {
			return createStatusResponse(http.StatusBadRequest, "fail", err.Error())
		}
	}

	return createStatusResponse(http.StatusOK, "success", "Cập nhật hồ sơ thành công")
}


