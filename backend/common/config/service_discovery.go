package config

import (
	"fmt"
	"os"
	"strings"
)

func normalizeInternalALBURL(raw string) string {
	albURL := strings.TrimSuffix(strings.TrimSpace(raw), "/")
	if albURL == "" {
		return ""
	}

	lower := strings.ToLower(albURL)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return albURL
	}

	return "http://" + albURL
}

// getLocalhostOverride redirects service discovery requests to localhost (127.0.0.1)
// when running inside a Render monolithic container where all services are co-located.
func getLocalhostOverride(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	if os.Getenv("RENDER") == "true" || os.Getenv("RENDER_MONOLITH") == "true" {
		for _, serviceHost := range []string{
			"auth-service",
			"event-service",
			"ticket-service",
			"venue-service",
			"staff-service",
			"notification-service",
		} {
			if strings.Contains(rawURL, serviceHost) {
				return strings.Replace(rawURL, serviceHost, "127.0.0.1", 1)
			}
		}
	}
	return rawURL
}

// GetServiceURL resolves service base URL for both Local and AWS environments.
// Priority:
// 1) INTERNAL_ALB_URL -> http://<alb-url> (for internal service-to-service on AWS)
// 2) localEnvKey (e.g. AUTH_SERVICE_URL)
// When using INTERNAL_ALB_URL, callers should use paths with /internal/ prefix
// NOTE: Trims trailing slash from INTERNAL_ALB_URL to prevent double slashes when concatenating paths
func GetServiceURL(localEnvKey string) string {
	if albURL := strings.TrimSpace(os.Getenv("INTERNAL_ALB_URL")); albURL != "" {
		return normalizeInternalALBURL(albURL)
	}

	return getLocalhostOverride(strings.TrimSpace(os.Getenv(localEnvKey)))
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
// NOTE: Trims trailing slash from INTERNAL_ALB_URL to prevent double slashes when concatenating paths
func MustGetServiceURLWithFallback(serviceName string, localEnvKey string, fallbackLocalPort int) string {
	// Try INTERNAL_ALB_URL first (AWS mode with proper env var)
	if albURL := strings.TrimSpace(os.Getenv("INTERNAL_ALB_URL")); albURL != "" {
		return normalizeInternalALBURL(albURL)
	}

	// Try service-specific env var (Local mode or AWS with explicit URL)
	if url := strings.TrimSpace(os.Getenv(localEnvKey)); url != "" {
		return getLocalhostOverride(url)
	}

	// Last resort fallback (Local development)
	return fmt.Sprintf("http://localhost:%d", fallbackLocalPort)
}
