package registry

import (
	"fmt"
	"os"
)

// ServiceInfo holds the metadata for a single microservice.
type ServiceInfo struct {
	Name   string // Human-readable: "Auth", "Event", …
	Label  string // Log prefix: "[AUTH]", "[EVENT]", …
	Port   int    // Default local port
	EnvKey string // Env var that can override the URL, e.g. AUTH_SERVICE_URL
}

// All registered services.  Order does not matter for lookups.
var Services = []ServiceInfo{
	{Name: "Auth", Label: "[AUTH]", Port: 8081, EnvKey: "AUTH_SERVICE_URL"},
	{Name: "Event", Label: "[EVENT]", Port: 8082, EnvKey: "EVENT_SERVICE_URL"},
	{Name: "Ticket", Label: "[TICKET]", Port: 8083, EnvKey: "TICKET_SERVICE_URL"},
	{Name: "Venue", Label: "[VENUE]", Port: 8084, EnvKey: "VENUE_SERVICE_URL"},
	{Name: "Staff", Label: "[STAFF]", Port: 8085, EnvKey: "STAFF_SERVICE_URL"},
	{Name: "Notification", Label: "[NOTIFICATION]", Port: 8086, EnvKey: "NOTIFICATION_SERVICE_URL"},
}

// byName is a lazy-initialized map for O(1) lookups.
var byName map[string]ServiceInfo

func init() {
	byName = make(map[string]ServiceInfo, len(Services))
	for _, s := range Services {
		byName[s.Name] = s
	}
}

// GetBackendURL returns the HTTP base URL for the named service.
// It first checks the corresponding env var; if unset it falls back
// to http://localhost:<port>.
func GetBackendURL(name string) string {
	if info, ok := byName[name]; ok {
		if v := os.Getenv(info.EnvKey); v != "" {
			return v
		}
		return fmt.Sprintf("http://localhost:%d", info.Port)
	}
	return ""
}

// GetPort returns the default port for the named service.
func GetPort(name string) int {
	if info, ok := byName[name]; ok {
		return info.Port
	}
	return 0
}

// AllBackendURLs returns a map[Name]URL for every registered service.
func AllBackendURLs() map[string]string {
	m := make(map[string]string, len(Services))
	for _, s := range Services {
		m[s.Name] = GetBackendURL(s.Name)
	}
	return m
}
