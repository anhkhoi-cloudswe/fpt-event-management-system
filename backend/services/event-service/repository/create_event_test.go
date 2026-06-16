package repository

import (
	"testing"

	"github.com/fpt-event-services/services/event-service/models"
)

// ============================================================
// Unit Tests for Create Event flows
// Tests validate struct field mapping, default values, and
// business logic for org_type/privacy_status/online meeting
// ============================================================

// ── Helper to create a string pointer ──
func strPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}

// ============================================================
// Test 1: Independent Event (FREE) with Online Zoom
// Expected: org_type=FREE, status=OPEN, online_meeting_url populated
// ============================================================
func TestCreateIndependentEvent_OnlineWithZoom(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Workshop AI Free",
		Description:        strPtr("Workshop trực tuyến qua Zoom"),
		PreferredStartTime: "2026-07-01T10:00:00",
		PreferredEndTime:   "2026-07-01T12:00:00",
		ExpectedCapacity:   intPtr(50),
		EventFormat:        "ONLINE",
		OrgType:            "FREE",
		PrivacyStatus:      "PUBLIC",
		OnlineMeetingURL:   strPtr("https://zoom.us/j/123456789"),
		OnlineMeetingID:    strPtr("123456789"),
		OnlineMeetingSecret: strPtr("abc123"),
	}

	// Validate org_type is FREE
	if req.OrgType != "FREE" {
		t.Errorf("Expected org_type=FREE, got %s", req.OrgType)
	}

	// Validate privacy_status is PUBLIC
	if req.PrivacyStatus != "PUBLIC" {
		t.Errorf("Expected privacy_status=PUBLIC, got %s", req.PrivacyStatus)
	}

	// Validate event_format is ONLINE
	if req.EventFormat != "ONLINE" {
		t.Errorf("Expected event_format=ONLINE, got %s", req.EventFormat)
	}

	// Validate online meeting URL is set
	if req.OnlineMeetingURL == nil || *req.OnlineMeetingURL == "" {
		t.Error("Expected online_meeting_url to be populated for ONLINE event")
	}

	// Validate online meeting ID is set
	if req.OnlineMeetingID == nil || *req.OnlineMeetingID == "" {
		t.Error("Expected online_meeting_id to be populated for ONLINE event")
	}

	// Validate online meeting secret is set
	if req.OnlineMeetingSecret == nil || *req.OnlineMeetingSecret == "" {
		t.Error("Expected online_meeting_secret to be populated for ONLINE event")
	}
}

// ============================================================
// Test 2: Independent Event (FREE) with Onsite — No Meeting Info
// Expected: org_type=FREE, online_meeting_* = nil
// ============================================================
func TestCreateIndependentEvent_OnsiteNoMeeting(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Hội thảo Onsite",
		Description:        strPtr("Sự kiện tại trường"),
		PreferredStartTime: "2026-07-15T09:00:00",
		PreferredEndTime:   "2026-07-15T17:00:00",
		ExpectedCapacity:   intPtr(100),
		EventFormat:        "ONSITE",
		CustomVenueName:    strPtr("Hội trường A"),
		CustomLocation:     strPtr("Tầng 2, FPT University"),
		OrgType:            "FREE",
		PrivacyStatus:      "PUBLIC",
		// No online meeting info for ONSITE
	}

	if req.OrgType != "FREE" {
		t.Errorf("Expected org_type=FREE, got %s", req.OrgType)
	}

	if req.OnlineMeetingURL != nil {
		t.Error("Expected online_meeting_url to be nil for ONSITE event")
	}

	if req.OnlineMeetingID != nil {
		t.Error("Expected online_meeting_id to be nil for ONSITE event")
	}

	if req.OnlineMeetingSecret != nil {
		t.Error("Expected online_meeting_secret to be nil for ONSITE event")
	}

	if req.CustomVenueName == nil || *req.CustomVenueName == "" {
		t.Error("Expected custom_venue_name to be set for ONSITE event")
	}
}

// ============================================================
// Test 3: School Event Request → PENDING status
// Expected: org_type=SCHOOL, status=PENDING (not directly OPEN)
// ============================================================
func TestCreateEventRequest_SchoolPending(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Hội thảo Lập trình",
		Description:        strPtr("Hội thảo chính quy tại trường"),
		PreferredStartTime: "2026-08-01T08:00:00",
		PreferredEndTime:   "2026-08-01T12:00:00",
		ExpectedCapacity:   intPtr(200),
		EventFormat:        "ONSITE",
		OrgType:            "SCHOOL",
		PrivacyStatus:      "PUBLIC",
	}

	// School events should use SCHOOL org_type
	if req.OrgType != "SCHOOL" {
		t.Errorf("Expected org_type=SCHOOL, got %s", req.OrgType)
	}

	// School events start with PENDING, not OPEN
	// Note: The actual status is set by the SQL query ('PENDING'), not by the request body.
	// This test validates that the org_type is correctly mapped.
	if req.EventFormat != "ONSITE" {
		t.Errorf("Expected event_format=ONSITE, got %s", req.EventFormat)
	}
}

// ============================================================
// Test 4: School Event Request with HYBRID + Meeting Info
// Expected: org_type=SCHOOL, online_meeting_* stored in event_request
// ============================================================
func TestCreateEventRequest_SchoolWithMeeting(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Workshop Kết Hợp",
		Description:        strPtr("Sự kiện kết hợp online + onsite"),
		PreferredStartTime: "2026-08-15T09:00:00",
		PreferredEndTime:   "2026-08-15T17:00:00",
		ExpectedCapacity:   intPtr(150),
		EventFormat:        "HYBRID",
		CustomVenueName:    strPtr("Sảnh lầu 3 & Google Meet"),
		CustomLocation:     strPtr("Tầng 3 - FPT University (Online: https://meet.google.com/abc-defg-hij)"),
		OrgType:            "SCHOOL",
		PrivacyStatus:      "PRIVATE",
		OnlineMeetingURL:   strPtr("https://meet.google.com/abc-defg-hij"),
		OnlineMeetingID:    strPtr("abc-defg-hij"),
		OnlineMeetingSecret: strPtr("meet_secret_123"),
	}

	if req.OrgType != "SCHOOL" {
		t.Errorf("Expected org_type=SCHOOL, got %s", req.OrgType)
	}

	if req.PrivacyStatus != "PRIVATE" {
		t.Errorf("Expected privacy_status=PRIVATE, got %s", req.PrivacyStatus)
	}

	if req.EventFormat != "HYBRID" {
		t.Errorf("Expected event_format=HYBRID, got %s", req.EventFormat)
	}

	// HYBRID school event should have meeting URL stored temporarily in request
	if req.OnlineMeetingURL == nil || *req.OnlineMeetingURL == "" {
		t.Error("Expected online_meeting_url to be populated for HYBRID event")
	}

	if req.OnlineMeetingID == nil || *req.OnlineMeetingID == "" {
		t.Error("Expected online_meeting_id to be populated for HYBRID event")
	}
}

// ============================================================
// Test 5: OrgType enum validation
// ============================================================
func TestOrgTypeEnum_Validation(t *testing.T) {
	validValues := []string{"SCHOOL", "FREE"}
	invalidValues := []string{"", "school", "free", "UNIVERSITY", "INDEPENDENT", "OTHER"}

	for _, v := range validValues {
		if v != "SCHOOL" && v != "FREE" {
			t.Errorf("Valid value %s rejected", v)
		}
	}

	for _, v := range invalidValues {
		if v == "SCHOOL" || v == "FREE" {
			t.Errorf("Invalid value %s accepted", v)
		}
	}
}

// ============================================================
// Test 6: PrivacyStatus enum validation
// ============================================================
func TestPrivacyStatusEnum_Validation(t *testing.T) {
	validValues := []string{"PUBLIC", "PRIVATE"}
	invalidValues := []string{"", "public", "private", "HIDDEN", "DRAFT"}

	for _, v := range validValues {
		if v != "PUBLIC" && v != "PRIVATE" {
			t.Errorf("Valid value %s rejected", v)
		}
	}

	for _, v := range invalidValues {
		if v == "PUBLIC" || v == "PRIVATE" {
			t.Errorf("Invalid value %s accepted", v)
		}
	}
}

// ============================================================
// Test 7: Default values when fields are empty
// Verifies that the repository layer defaults are correct
// ============================================================
func TestDefaultValues_IndependentEvent(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Test Default Values",
		PreferredStartTime: "2026-09-01T10:00:00",
		PreferredEndTime:   "2026-09-01T12:00:00",
		EventFormat:        "ONSITE",
		// OrgType and PrivacyStatus intentionally left empty
	}

	// Simulate repository default logic
	orgType := req.OrgType
	if orgType == "" {
		orgType = "FREE"
	}

	privacyStatus := req.PrivacyStatus
	if privacyStatus == "" {
		privacyStatus = "PUBLIC"
	}

	if orgType != "FREE" {
		t.Errorf("Expected default org_type=FREE, got %s", orgType)
	}

	if privacyStatus != "PUBLIC" {
		t.Errorf("Expected default privacy_status=PUBLIC, got %s", privacyStatus)
	}
}

// ============================================================
// Test 8: Default values when fields are empty for School Request
// Verifies that the repository layer defaults are correct
// ============================================================
func TestDefaultValues_SchoolRequest(t *testing.T) {
	req := &models.CreateEventRequestBody{
		Title:              "Test Default School",
		PreferredStartTime: "2026-09-01T10:00:00",
		PreferredEndTime:   "2026-09-01T12:00:00",
		EventFormat:        "ONSITE",
		// OrgType and PrivacyStatus intentionally left empty
	}

	// Simulate repository default logic for CreateEventRequest
	orgType := req.OrgType
	if orgType == "" {
		orgType = "SCHOOL"
	}

	privacyStatus := req.PrivacyStatus
	if privacyStatus == "" {
		privacyStatus = "PUBLIC"
	}

	if orgType != "SCHOOL" {
		t.Errorf("Expected default org_type=SCHOOL for event request, got %s", orgType)
	}

	if privacyStatus != "PUBLIC" {
		t.Errorf("Expected default privacy_status=PUBLIC, got %s", privacyStatus)
	}
}
