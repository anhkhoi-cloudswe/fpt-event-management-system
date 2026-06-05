package recaptcha

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var ErrResourceExhausted = errors.New("recaptcha resource exhausted")

// Config holds reCAPTCHA configuration
type Config struct {
	SecretKey  string  // Server-side secret key from Google
	SiteKey    string  // Client-side site key (for reference)
	VerifyURL  string  // Google verification URL
	MinScore   float64 // Minimum score for v3 (0.0 - 1.0)
	Timeout    time.Duration
	SkipVerify bool // Skip verification in dev mode
}

// DefaultConfig returns reCAPTCHA config from environment variables
func DefaultConfig() *Config {
	return &Config{
		SecretKey:  getEnv("RECAPTCHA_SECRET", ""),
		SiteKey:    getEnv("RECAPTCHA_SITE_KEY", ""),
		VerifyURL:  "https://www.google.com/recaptcha/api/siteverify",
		MinScore:   0.5, // Default threshold for v3
		Timeout:    10 * time.Second,
		SkipVerify: getEnv("RECAPTCHA_SKIP_VERIFY", "false") == "true",
	}
}

// VerifyResponse represents Google's reCAPTCHA verification response
type VerifyResponse struct {
	Success     bool      `json:"success"`
	Score       float64   `json:"score,omitempty"`  // v3 only
	Action      string    `json:"action,omitempty"` // v3 only
	ChallengeTS time.Time `json:"challenge_ts"`
	Hostname    string    `json:"hostname"`
	ErrorCodes  []string  `json:"error-codes,omitempty"`
}

// VerifyResult represents the verification result with additional context
type VerifyResult struct {
	Valid        bool
	Score        float64
	Action       string
	ErrorMessage string
	RawResponse  *VerifyResponse
}

// RecaptchaService handles reCAPTCHA verification
type RecaptchaService struct {
	config *Config
	client *http.Client
}

// NewRecaptchaService creates a new reCAPTCHA service
func NewRecaptchaService(config *Config) *RecaptchaService {
	if config == nil {
		config = DefaultConfig()
	}

	return &RecaptchaService{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

// IsConfigured returns true if reCAPTCHA is properly configured
func (s *RecaptchaService) IsConfigured() bool {
	return s.config.SecretKey != "" && !s.config.SkipVerify
}

// Verify verifies a reCAPTCHA token
func (s *RecaptchaService) Verify(token string, remoteIP string) (*VerifyResult, error) {
	result := &VerifyResult{}

	// Skip verification if not configured or in dev mode
	if !s.IsConfigured() {
		fmt.Println("⚠️ reCAPTCHA: Skipping verification (not configured or dev mode)")
		result.Valid = true
		result.Score = 1.0
		result.ErrorMessage = "verification skipped"
		return result, nil
	}

	// Validate token
	if token == "" {
		result.Valid = false
		result.ErrorMessage = "reCAPTCHA token is required"
		return result, nil
	}

	// Prepare request data
	data := url.Values{}
	data.Set("secret", s.config.SecretKey)
	data.Set("response", token)
	if remoteIP != "" {
		data.Set("remoteip", remoteIP)
	}

	// Make verification request
	resp, err := s.client.PostForm(s.config.VerifyURL, data)
	if err != nil {
		result.Valid = false
		result.ErrorMessage = fmt.Sprintf("failed to verify reCAPTCHA: %v", err)
		return result, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		result.Valid = false
		result.ErrorMessage = "resource exhausted"
		return result, ErrResourceExhausted
	}

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Valid = false
		result.ErrorMessage = fmt.Sprintf("failed to read response: %v", err)
		return result, err
	}

	// Parse response
	var verifyResp VerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		result.Valid = false
		result.ErrorMessage = fmt.Sprintf("failed to parse response: %v", err)
		return result, err
	}

	result.RawResponse = &verifyResp
	result.Score = verifyResp.Score
	result.Action = verifyResp.Action

	// Check success
	if !verifyResp.Success {
		result.Valid = false
		result.ErrorMessage = formatErrorCodes(verifyResp.ErrorCodes)
		return result, nil
	}

	// For v3, check score threshold
	if verifyResp.Score > 0 && verifyResp.Score < s.config.MinScore {
		result.Valid = false
		result.ErrorMessage = fmt.Sprintf("score too low: %.2f (minimum: %.2f)", verifyResp.Score, s.config.MinScore)
		return result, nil
	}

	result.Valid = true
	return result, nil
}

// VerifyWithAction verifies a reCAPTCHA v3 token with action validation
func (s *RecaptchaService) VerifyWithAction(token, expectedAction, remoteIP string) (*VerifyResult, error) {
	result, err := s.Verify(token, remoteIP)
	if err != nil {
		return result, err
	}

	// For v3, also verify action matches
	if result.Valid && result.Action != "" && expectedAction != "" {
		if result.Action != expectedAction {
			result.Valid = false
			result.ErrorMessage = fmt.Sprintf("action mismatch: expected '%s', got '%s'", expectedAction, result.Action)
		}
	}

	return result, nil
}

// VerifyV2 verifies a reCAPTCHA v2 (checkbox) token
func (s *RecaptchaService) VerifyV2(token string, remoteIP string) (bool, error) {
	result, err := s.Verify(token, remoteIP)
	if err != nil {
		return false, err
	}
	return result.Valid, nil
}

// formatErrorCodes converts error codes to human-readable message
func formatErrorCodes(codes []string) string {
	if len(codes) == 0 {
		return "unknown error"
	}

	messages := make([]string, 0, len(codes))
	for _, code := range codes {
		messages = append(messages, getErrorMessage(code))
	}
	return strings.Join(messages, "; ")
}

// getErrorMessage returns human-readable error message
func getErrorMessage(code string) string {
	errorMessages := map[string]string{
		"missing-input-secret":   "Thiếu secret key",
		"invalid-input-secret":   "Secret key không hợp lệ",
		"missing-input-response": "Thiếu token reCAPTCHA",
		"invalid-input-response": "Token reCAPTCHA không hợp lệ hoặc đã hết hạn",
		"bad-request":            "Yêu cầu không hợp lệ",
		"timeout-or-duplicate":   "Token đã hết hạn hoặc đã được sử dụng",
	}

	if msg, ok := errorMessages[code]; ok {
		return msg
	}
	return code
}

// ============================================================
// Middleware helper for HTTP handlers
// ============================================================

// RecaptchaMiddleware creates a middleware that verifies reCAPTCHA
func (s *RecaptchaService) RecaptchaMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Get token from header or request body
		token := r.Header.Get("X-Recaptcha-Token")
		if token == "" {
			token = r.FormValue("recaptchaToken")
		}
		if token == "" {
			token = r.FormValue("g-recaptcha-response")
		}

		// Get remote IP
		remoteIP := getClientIP(r)

		// Verify token
		result, err := s.Verify(token, remoteIP)
		if err != nil {
			http.Error(w, "reCAPTCHA verification failed", http.StatusInternalServerError)
			return
		}

		if !result.Valid {
			http.Error(w, "reCAPTCHA verification failed: "+result.ErrorMessage, http.StatusForbidden)
			return
		}

		// Continue to next handler
		next(w, r)
	}
}

// getClientIP extracts client IP from request
func getClientIP(r *http.Request) string {
	// Check common headers for real IP behind proxies
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}

	realIP := r.Header.Get("X-Real-IP")
	if realIP != "" {
		return realIP
	}

	// Extract IP from RemoteAddr
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}

// getScheme extracts request scheme (http/https) from X-Forwarded-Proto header
// Used when running behind load balancer (ALB/API Gateway)
func getScheme(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = r.Header.Get("x-forwarded-proto")
	}
	if proto != "" {
		return strings.ToLower(strings.TrimSpace(proto))
	}
	// Default to https in production for safety
	return "https"
}

// Helper function
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
