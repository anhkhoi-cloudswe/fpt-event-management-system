package timeutil

import (
	"os"
	"time"
)

// GetNow returns the current time, optionally overridden by SYSTEM_TIME_OVERRIDE environment variable.
//
// This function implements the "Time Machine Environment" feature for testing & demonstration.
// It is a leaf package with NO dependencies on other common packages to avoid import cycles.
//
// How it works:
//   - Checks the SYSTEM_TIME_OVERRIDE environment variable
//   - If set and valid (RFC3339 format), returns that time (e.g., "2026-04-01T08:30:00+07:00")
//   - If not set or invalid, returns time.Now()
//   - The returned time is always in the specified timezone (from the RFC3339 string)
//
// Example usage:
//
//	currentTime := timeutil.GetNow()
//	// Do something with currentTime
//
// To enable Time Machine:
//
//	export SYSTEM_TIME_OVERRIDE="2026-04-01T08:30:00+07:00"
//	docker-compose up  # With .env containing the variable above
//
// IMPORTANT: This package is a "leaf package" - it MUST NOT import any other
// common packages (logger, config, etc.) to prevent import cycles.
func GetNow() time.Time {
	override := os.Getenv("SYSTEM_TIME_OVERRIDE")

	if override != "" {
		// Try to parse as RFC3339 format
		if parsedTime, err := time.Parse(time.RFC3339, override); err == nil {
			return parsedTime
		}
		// If parsing fails, silently fall back to time.Now()
		// (cannot use logger here to avoid import cycles)
	}

	return time.Now()
}
