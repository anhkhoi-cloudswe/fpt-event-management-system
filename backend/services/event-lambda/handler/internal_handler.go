package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// Event Internal Handler - APIs nội bộ cho Microservices
//
// Các API này KHÔNG được expose ra ngoài (Frontend không gọi):
//   1. GET /internal/events/active-by-venue?venueId=  → Đếm event OPEN/DRAFT trong venue
//   2. GET /internal/events/busy-areas?startTime=&endTime= → Danh sách area_id đã bận
//   3. GET /internal/events/area?eventId=              → Lấy area_id của event
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// EventInternalHandler xử lý các request nội bộ từ service khác
type EventInternalHandler struct {
	db     *sql.DB
	logger *logger.Logger
}

// NewEventInternalHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewEventInternalHandlerWithDB(dbConn *sql.DB) *EventInternalHandler {
	return &EventInternalHandler{
		db:     dbConn,
		logger: logger.Default(),
	}
}

// ============================================================
//  1. HandleActiveByVenue - GET /internal/events/active-by-venue?venueId=
//     Đếm số event OPEN/DRAFT trong các area của venue
//     Dùng bởi: venue-lambda → HasActiveEventsComposed
//
// ============================================================
func (h *EventInternalHandler) HandleActiveByVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isEventInternalCall(request) {
		return createEventInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	venueIDStr := request.QueryStringParameters["venueId"]
	if venueIDStr == "" {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": "venueId required"})
	}

	venueID, err := strconv.Atoi(venueIDStr)
	if err != nil {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid venueId"})
	}

	// Query Event table (event domain) + Venue_Area (cùng query nhưng chỉ join với area)
	query := `
		SELECT COUNT(*) as count 
		FROM Event e
		INNER JOIN Venue_Area va ON e.area_id = va.area_id
		WHERE va.venue_id = ? 
		AND e.status IN ('OPEN', 'DRAFT')
	`

	var count int
	err = h.db.QueryRowContext(ctx, query, venueID).Scan(&count)
	if err != nil {
		h.logger.Warn("[INTERNAL_EVENT] Failed to count active events for venue %d: %v", venueID, err)
		return createEventInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	h.logger.Info("[INTERNAL_EVENT] ✅ ActiveByVenue: venueId=%d, count=%d", venueID, count)
	return createEventInternalResponse(http.StatusOK, map[string]int{"count": count})
}

// ============================================================
//  2. HandleBusyAreas - GET /internal/events/busy-areas?startTime=&endTime=
//     Trả về danh sách area_id đã có event trong khoảng thời gian (có buffer 1h)
//     Dùng bởi: venue-lambda → GetFreeAreasComposed
//
// ============================================================
func (h *EventInternalHandler) HandleBusyAreas(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isEventInternalCall(request) {
		return createEventInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	startTimeStr := request.QueryStringParameters["startTime"]
	endTimeStr := request.QueryStringParameters["endTime"]

	if startTimeStr == "" || endTimeStr == "" {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": "startTime and endTime required"})
	}

	// Parse times with buffer (same logic as venue_repository.go)
	startParsed, err := parseEventTime(startTimeStr)
	if err != nil {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid startTime: %v", err)})
	}
	endParsed, err := parseEventTime(endTimeStr)
	if err != nil {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid endTime: %v", err)})
	}

	// Add 1 hour buffer (same as original GetFreeAreas)
	startBuffer := startParsed.Add(-1 * time.Hour).Format("2006-01-02 15:04:05")
	endBuffer := endParsed.Add(1 * time.Hour).Format("2006-01-02 15:04:05")

	query := `
		SELECT DISTINCT e.area_id 
		FROM Event e
		WHERE e.status IN ('OPEN', 'CLOSED', 'DRAFT')
		AND e.area_id IS NOT NULL
		AND e.start_time < ?
		AND e.end_time > ?
	`

	rows, err := h.db.QueryContext(ctx, query, endBuffer, startBuffer)
	if err != nil {
		h.logger.Warn("[INTERNAL_EVENT] Failed to query busy areas: %v", err)
		return createEventInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var areaIDs []int
	for rows.Next() {
		var areaID int
		if err := rows.Scan(&areaID); err != nil {
			continue
		}
		areaIDs = append(areaIDs, areaID)
	}

	if areaIDs == nil {
		areaIDs = []int{}
	}

	h.logger.Info("[INTERNAL_EVENT] ✅ BusyAreas: startTime=%s, endTime=%s, busyCount=%d", startTimeStr, endTimeStr, len(areaIDs))
	return createEventInternalResponse(http.StatusOK, map[string]interface{}{"areaIds": areaIDs})
}

// ============================================================
//  3. HandleGetEventArea - GET /internal/events/area?eventId=
//     Trả về area_id của event cụ thể
//     Dùng bởi: venue-lambda → GetSeatsForEventComposed
//
// ============================================================
func (h *EventInternalHandler) HandleGetEventArea(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isEventInternalCall(request) {
		return createEventInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	eventIDStr := request.QueryStringParameters["eventId"]
	if eventIDStr == "" {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": "eventId required"})
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createEventInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid eventId"})
	}

	var areaID int
	query := `SELECT area_id FROM Event WHERE event_id = ?`
	err = h.db.QueryRowContext(ctx, query, eventID).Scan(&areaID)
	if err != nil {
		if err == sql.ErrNoRows {
			return createEventInternalResponse(http.StatusNotFound, map[string]string{"error": "event not found"})
		}
		h.logger.Warn("[INTERNAL_EVENT] Failed to get area for event %d: %v", eventID, err)
		return createEventInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	h.logger.Info("[INTERNAL_EVENT] ✅ GetEventArea: eventId=%d → areaId=%d", eventID, areaID)
	return createEventInternalResponse(http.StatusOK, map[string]int{"eventId": eventID, "areaId": areaID})
}

// ============================================================
// HELPERS
// ============================================================

func isEventInternalCall(request events.APIGatewayProxyRequest) bool {
	return request.Headers["X-Internal-Call"] == "true"
}

func createEventInternalResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"error":"failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{"Content-Type": "application/json;charset=UTF-8"},
		Body:       string(body),
	}, nil
}

// parseEventTime parses time strings, supporting multiple formats
func parseEventTime(timeStr string) (time.Time, error) {
	formats := []string{
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		time.RFC3339,
	}
	for _, layout := range formats {
		if t, err := time.Parse(layout, timeStr); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time format: %s", timeStr)
}
