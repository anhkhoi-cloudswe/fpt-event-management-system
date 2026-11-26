package config

import (
	"os"
	"strings"
)

// IsRootAdminEmail checks whether the given email matches any configured
// Root Admin email in the ROOT_ADMIN_EMAIL environment variable
// (supports a single email or comma-separated list, case-insensitive).
// Returns false if ROOT_ADMIN_EMAIL is not configured (fail-closed).
func IsRootAdminEmail(email string) bool {
	trimmedTarget := strings.TrimSpace(email)
	if trimmedTarget == "" {
		return false
	}

	raw := os.Getenv("ROOT_ADMIN_EMAIL")
	if strings.TrimSpace(raw) == "" {
		return false
	}

	for _, candidate := range strings.Split(raw, ",") {
		c := strings.TrimSpace(candidate)
		if c != "" && strings.EqualFold(trimmedTarget, c) {
			return true
		}
	}
	return false
}
