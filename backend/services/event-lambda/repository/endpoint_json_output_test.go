package repository

import (
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-lambda/models"
)

func TestJSONOutput_PublicDashboardTimes_AreVietnam(t *testing.T) {
	startUTC := time.Date(2026, 3, 31, 2, 0, 0, 0, time.UTC)
	endUTC := time.Date(2026, 3, 31, 9, 0, 0, 0, time.UTC)

	payload := EventListV1Result{
		Data: []models.EventListItem{
			{
				EventID:   1,
				Title:     "AWS re:Invent 2025",
				StartTime: formatTimeToWallClockRFC3339(startUTC),
				EndTime:   formatTimeToWallClockRFC3339(endUTC),
			},
		},
		Total:      1,
		Page:       1,
		Limit:      10,
		TotalPages: 1,
	}

	body, err := utils.MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	jsonStr := string(body)
	t.Logf("/api/v1/events raw json: %s", jsonStr)
	if !strings.Contains(jsonStr, `"startTime":"2026-03-31T09:00:00+07:00"`) {
		t.Fatalf("public list startTime is not VN time: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"endTime":"2026-03-31T16:00:00+07:00"`) {
		t.Fatalf("public list endTime is not VN time: %s", jsonStr)
	}
}

func TestJSONOutput_PublicDashboardTimes_Converts0100UTCTo0800VN(t *testing.T) {
	startUTC := time.Date(2026, 3, 31, 1, 0, 0, 0, time.UTC)
	endUTC := time.Date(2026, 3, 31, 5, 0, 0, 0, time.UTC)

	payload := EventListV1Result{
		Data: []models.EventListItem{
			{
				EventID:   1061,
				Title:     "Timezone Regression Check",
				StartTime: formatTimeToWallClockRFC3339(startUTC),
				EndTime:   formatTimeToWallClockRFC3339(endUTC),
			},
		},
		Total:      1,
		Page:       1,
		Limit:      10,
		TotalPages: 1,
	}

	body, err := utils.MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	jsonStr := string(body)
	t.Logf("/api/events/detail raw json (id=1061): %s", jsonStr)
	if !strings.Contains(jsonStr, `"startTime":"2026-03-31T08:00:00+07:00"`) {
		t.Fatalf("public startTime is not converted to VN time: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"endTime":"2026-03-31T12:00:00+07:00"`) {
		t.Fatalf("public endTime is not converted to VN time: %s", jsonStr)
	}
}

func TestJSONOutput_PublicDashboardTimes_Converts0000UTCTo0700VN(t *testing.T) {
	startUTC := time.Date(2026, 3, 30, 0, 0, 0, 0, time.UTC)
	endUTC := time.Date(2026, 3, 30, 5, 0, 0, 0, time.UTC)

	payload := EventListV1Result{
		Data: []models.EventListItem{
			{
				EventID:   1062,
				Title:     "UTC Midnight Conversion",
				StartTime: formatTimeToWallClockRFC3339(startUTC),
				EndTime:   formatTimeToWallClockRFC3339(endUTC),
			},
		},
		Total:      1,
		Page:       1,
		Limit:      10,
		TotalPages: 1,
	}

	body, err := utils.MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	jsonStr := string(body)
	t.Logf("/api/events/detail raw json (id=1062): %s", jsonStr)
	if !strings.Contains(jsonStr, `"startTime":"2026-03-30T07:00:00+07:00"`) {
		t.Fatalf("public startTime is not converted to VN time: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"endTime":"2026-03-30T12:00:00+07:00"`) {
		t.Fatalf("public endTime is not converted to VN time: %s", jsonStr)
	}
}

func TestJSONOutput_AuditFields_AreVietnam(t *testing.T) {
	createdUTC := time.Date(2026, 3, 28, 9, 36, 0, 0, time.UTC)
	processedUTC := time.Date(2026, 3, 28, 9, 36, 0, 0, time.UTC)

	req := models.EventRequest{
		RequestID:   101,
		RequesterID: 7,
		Title:       "AWS re:Invent 2025",
		Status:      "APPROVED",
	}
	setEventRequestTimeFields(
		&req,
		sql.NullTime{},
		sql.NullTime{},
		sql.NullTime{Time: createdUTC, Valid: true},
		sql.NullTime{Time: processedUTC, Valid: true},
	)

	body, err := utils.MarshalVietnamJSON(req)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	jsonStr := string(body)
	t.Logf("/api/events/detail audit raw json: %s", jsonStr)
	if !strings.Contains(jsonStr, `"createdAt":"2026-03-28T16:36:00+07:00"`) {
		t.Fatalf("createdAt is not VN time: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"processedAt":"2026-03-28T16:36:00+07:00"`) {
		t.Fatalf("processedAt is not VN time: %s", jsonStr)
	}
}

func TestJSONOutput_EventDetailTimes_AreVietnam(t *testing.T) {
	startUTC := time.Date(2026, 3, 31, 2, 0, 0, 0, time.UTC)
	endUTC := time.Date(2026, 3, 31, 9, 0, 0, 0, time.UTC)

	payload := models.EventDetailDto{
		EventID:   1,
		Title:     "AWS re:Invent 2025",
		StartTime: formatTimeToWallClockRFC3339(startUTC),
		EndTime:   formatTimeToWallClockRFC3339(endUTC),
		MaxSeats:  500,
		Status:    "APPROVED",
		Tickets:   []models.CategoryTicket{},
		Seats:     []models.SeatResponse{},
	}

	body, err := utils.MarshalVietnamJSON(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	jsonStr := string(body)
	t.Logf("/api/events/detail raw json: %s", jsonStr)
	if !strings.Contains(jsonStr, `"startTime":"2026-03-31T09:00:00+07:00"`) {
		t.Fatalf("detail startTime is not VN time: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"endTime":"2026-03-31T16:00:00+07:00"`) {
		t.Fatalf("detail endTime is not VN time: %s", jsonStr)
	}
}

func TestformatTimeToWallClockRFC3339_ConvertsUTCToVietnam(t *testing.T) {
	utcInput := time.Date(2026, 3, 31, 2, 0, 0, 0, time.UTC)

	got := formatTimeToWallClockRFC3339(utcInput)
	want := "2026-03-31T09:00:00+07:00"

	if got != want {
		t.Fatalf("unexpected formatted time: got=%s want=%s", got, want)
	}
}

func TestSetEventRequestTimeFields_ConvertsAuditFieldsFromUTC(t *testing.T) {
	createdUTC := time.Date(2026, 3, 28, 8, 36, 0, 0, time.UTC)
	processedUTC := time.Date(2026, 3, 28, 9, 36, 0, 0, time.UTC)

	req := models.EventRequest{}
	setEventRequestTimeFields(
		&req,
		sql.NullTime{},
		sql.NullTime{},
		sql.NullTime{Time: createdUTC, Valid: true},
		sql.NullTime{Time: processedUTC, Valid: true},
	)

	if req.CreatedAt == nil || req.ProcessedAt == nil {
		t.Fatalf("expected CreatedAt and ProcessedAt to be set")
	}

	if *req.CreatedAt != "2026-03-28T15:36:00+07:00" {
		t.Fatalf("createdAt not converted correctly: got=%s", *req.CreatedAt)
	}
	if *req.ProcessedAt != "2026-03-28T16:36:00+07:00" {
		t.Fatalf("processedAt not converted correctly: got=%s", *req.ProcessedAt)
	}
}

