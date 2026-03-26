package config

import (
	"fmt"
	"os"
	"strings"
)

// GetServiceURL resolves service base URL for both Local and AWS environments.
// Priority:
// 1) INTERNAL_ALB_URL -> http://<alb-url> (for internal service-to-service on AWS)
// 2) localEnvKey (e.g. AUTH_SERVICE_URL)
// When using INTERNAL_ALB_URL, callers should use paths with /internal/ prefix
func GetServiceURL(localEnvKey string) string {
	if albURL := strings.TrimSpace(os.Getenv("INTERNAL_ALB_URL")); albURL != "" {
		return "http://" + albURL
	}

	return strings.TrimSpace(os.Getenv(localEnvKey))
}

// IsAWSMode returns true if the application is running on AWS Lambda/ECS with INTERNAL_ALB_URL
func IsAWSMode() bool {
	albURL := strings.TrimSpace(os.Getenv("INTERNAL_ALB_URL"))
	awsFunc := os.Getenv("AWS_LAMBDA_FUNCTION_NAME") // AWS Lambda env var
	return albURL != "" || awsFunc != ""
}

// MustGetServiceURLWithFallback returns service URL with intelligent fallback.
// For AWS: uses INTERNAL_ALB_URL. For Local: uses localEnvKey or fallback URL.
// This prevents silent failures when INTERNAL_ALB_URL is missing on AWS.
func MustGetServiceURLWithFallback(serviceName string, localEnvKey string, fallbackLocalPort int) string {
	// Try INTERNAL_ALB_URL first (AWS mode with proper env var)
	if albURL := strings.TrimSpace(os.Getenv("INTERNAL_ALB_URL")); albURL != "" {
		return fmt.Sprintf("http://%s", albURL)
	}

	// Try service-specific env var (Local mode or AWS with explicit URL)
	if url := strings.TrimSpace(os.Getenv(localEnvKey)); url != "" {
		return url
	}

	// Last resort fallback (Local development)
	return fmt.Sprintf("http://localhost:%d", fallbackLocalPort)
}
