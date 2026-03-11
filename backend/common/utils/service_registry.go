package utils

import "github.com/fpt-event-services/common/registry"

// ============================================================
// Service Registry - Thin wrapper delegating to common/registry
// Giữ nguyên function signatures để không break caller code
// ============================================================

// GetAuthServiceURL trả về base URL của Auth Service
func GetAuthServiceURL() string {
	return registry.GetBackendURL("Auth")
}

// GetEventServiceURL trả về base URL của Event Service
func GetEventServiceURL() string {
	return registry.GetBackendURL("Event")
}

// GetVenueServiceURL trả về base URL của Venue Service
func GetVenueServiceURL() string {
	return registry.GetBackendURL("Venue")
}

// GetTicketServiceURL trả về base URL của Ticket Service
func GetTicketServiceURL() string {
	return registry.GetBackendURL("Ticket")
}

// GetStaffServiceURL trả về base URL của Staff Service
func GetStaffServiceURL() string {
	return registry.GetBackendURL("Staff")
}

// GetNotificationServiceURL trả về base URL của Notification Service
func GetNotificationServiceURL() string {
	return registry.GetBackendURL("Notification")
}
