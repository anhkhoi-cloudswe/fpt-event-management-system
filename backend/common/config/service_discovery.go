package config

import (
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
