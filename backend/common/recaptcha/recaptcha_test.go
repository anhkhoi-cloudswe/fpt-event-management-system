package recaptcha

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestVerify_DevMode(t *testing.T) {
	config := &Config{
		SecretKey:  "", // Empty = dev mode
		SkipVerify: true,
	}
	service := NewRecaptchaService(config)

	result, err := service.Verify("any-token", "127.0.0.1")
	if err != nil {
		t.Errorf("Verify() error = %v", err)
	}
	if !result.Valid {
		t.Error("Verify() should return valid in dev mode")
	}
}

func TestVerify_EmptyToken(t *testing.T) {
	config := &Config{
		SecretKey: "test-secret-key",
		VerifyURL: "https://www.google.com/recaptcha/api/siteverify",
		Timeout:   5 * time.Second,
	}
	service := NewRecaptchaService(config)

	result, err := service.Verify("", "127.0.0.1")
	if err != nil {
		t.Errorf("Verify() error = %v", err)
	}
	if result.Valid {
		t.Error("Verify() should return invalid for empty token")
	}
	if result.ErrorMessage != "reCAPTCHA token is required" {
		t.Errorf("Verify() errorMessage = %v", result.ErrorMessage)
	}
}

func TestVerify_MockSuccess(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := VerifyResponse{
			Success:     true,
			Score:       0.9,
			Action:      "login",
			ChallengeTS: time.Now(),
			Hostname:    "localhost",
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	config := &Config{
		SecretKey: "test-secret-key",
		VerifyURL: server.URL,
		MinScore:  0.5,
		Timeout:   5 * time.Second,
	}
	service := NewRecaptchaService(config)

	result, err := service.Verify("valid-token", "127.0.0.1")
	if err != nil {
		t.Errorf("Verify() error = %v", err)
	}
	if !result.Valid {
		t.Error("Verify() should return valid for successful response")
	}
	if result.Score != 0.9 {
		t.Errorf("Verify() score = %v, want 0.9", result.Score)
	}
}

func TestVerify_MockLowScore(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := VerifyResponse{
			Success:     true,
			Score:       0.2, // Below threshold
			Action:      "login",
			ChallengeTS: time.Now(),
			Hostname:    "localhost",
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	config := &Config{
		SecretKey: "test-secret-key",
		VerifyURL: server.URL,
		MinScore:  0.5,
		Timeout:   5 * time.Second,
	}
	service := NewRecaptchaService(config)

	result, err := service.Verify("valid-token", "127.0.0.1")
	if err != nil {
		t.Errorf("Verify() error = %v", err)
	}
	if result.Valid {
		t.Error("Verify() should return invalid for low score")
	}
}

func TestVerify_MockFailure(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := VerifyResponse{
			Success:    false,
			ErrorCodes: []string{"invalid-input-response"},
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	config := &Config{
		SecretKey: "test-secret-key",
		VerifyURL: server.URL,
		Timeout:   5 * time.Second,
	}
	service := NewRecaptchaService(config)

	result, err := service.Verify("invalid-token", "127.0.0.1")
	if err != nil {
		t.Errorf("Verify() error = %v", err)
	}
	if result.Valid {
		t.Error("Verify() should return invalid for failed response")
	}
}

func TestVerifyWithAction_ActionMismatch(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := VerifyResponse{
			Success:     true,
			Score:       0.9,
			Action:      "register", // Different action
			ChallengeTS: time.Now(),
			Hostname:    "localhost",
		}
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	config := &Config{
		SecretKey: "test-secret-key",
		VerifyURL: server.URL,
		MinScore:  0.5,
		Timeout:   5 * time.Second,
	}
	service := NewRecaptchaService(config)

	result, err := service.VerifyWithAction("valid-token", "login", "127.0.0.1")
	if err != nil {
		t.Errorf("VerifyWithAction() error = %v", err)
	}
	if result.Valid {
		t.Error("VerifyWithAction() should return invalid for action mismatch")
	}
}

func TestGetErrorMessage(t *testing.T) {
	tests := []struct {
		code     string
		expected string
	}{
		{"missing-input-secret", "Thiếu secret key"},
		{"invalid-input-secret", "Secret key không hợp lệ"},
		{"invalid-input-response", "Token reCAPTCHA không hợp lệ hoặc đã hết hạn"},
		{"timeout-or-duplicate", "Token đã hết hạn hoặc đã được sử dụng"},
		{"unknown-code", "unknown-code"},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			result := getErrorMessage(tt.code)
			if result != tt.expected {
				t.Errorf("getErrorMessage(%s) = %s, want %s", tt.code, result, tt.expected)
			}
		})
	}
}

func TestGetClientIP(t *testing.T) {
	tests := []struct {
		name       string
		headers    map[string]string
		remoteAddr string
		expected   string
	}{
		{
			name:       "X-Forwarded-For single IP",
			headers:    map[string]string{"X-Forwarded-For": "1.2.3.4"},
			remoteAddr: "5.6.7.8:1234",
			expected:   "1.2.3.4",
		},
		{
			name:       "X-Forwarded-For multiple IPs",
			headers:    map[string]string{"X-Forwarded-For": "1.2.3.4, 5.6.7.8"},
			remoteAddr: "9.10.11.12:1234",
			expected:   "1.2.3.4",
		},
		{
			name:       "X-Real-IP",
			headers:    map[string]string{"X-Real-IP": "1.2.3.4"},
			remoteAddr: "5.6.7.8:1234",
			expected:   "1.2.3.4",
		},
		{
			name:       "RemoteAddr only",
			headers:    map[string]string{},
			remoteAddr: "5.6.7.8:1234",
			expected:   "5.6.7.8",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			for k, v := range tt.headers {
				r.Header.Set(k, v)
			}
			r.RemoteAddr = tt.remoteAddr

			result := getClientIP(r)
			if result != tt.expected {
				t.Errorf("getClientIP() = %s, want %s", result, tt.expected)
			}
		})
	}
}

func TestIsConfigured(t *testing.T) {
	tests := []struct {
		name       string
		secretKey  string
		skipVerify bool
		expected   bool
	}{
		{"Configured", "secret-key", false, true},
		{"No secret key", "", false, false},
		{"Skip verify enabled", "secret-key", true, false},
		{"No secret key and skip verify", "", true, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &Config{
				SecretKey:  tt.secretKey,
				SkipVerify: tt.skipVerify,
			}
			service := NewRecaptchaService(config)

			if result := service.IsConfigured(); result != tt.expected {
				t.Errorf("IsConfigured() = %v, want %v", result, tt.expected)
			}
		})
	}
}
