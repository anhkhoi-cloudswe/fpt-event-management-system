package utils

import (
	"crypto/subtle"
	"os"
	"strings"
)

// GetInternalAuthToken returns the expected shared secret used by internal service calls.
func GetInternalAuthToken() string {
	return strings.TrimSpace(os.Getenv("INTERNAL_AUTH_TOKEN"))
}

// IsValidInternalToken validates X-Internal-Token against INTERNAL_AUTH_TOKEN.
func IsValidInternalToken(headers map[string]string) bool {
	expected := GetInternalAuthToken()
	if expected == "" {
		return false
	}

	provided := strings.TrimSpace(headers["X-Internal-Token"])
	if provided == "" {
		provided = strings.TrimSpace(headers["x-internal-token"])
	}
	if provided == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
