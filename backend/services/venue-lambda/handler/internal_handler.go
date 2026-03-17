package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/venue-lambda/models"
	"github.com/fpt-event-services/services/venue-lambda/usecase"
)

// ============================================================
// Venue Internal Handler - APIs nội bộ cho Microservices
//
// Các API này KHÔNG được expose ra ngoài (Frontend không gọi):
//   1. GET  /internal/venue/info          → Thông tin venue by ID
//   2. GET  /internal/venue/area/info     → Thông tin area by ID
//   3. GET  /internal/venue/areas         → Danh sách areas by venue ID
//   4. GET  /internal/venue/seat/info     → Thông tin seat by ID
//   5. GET  /internal/venue/seats         → Danh sách seats by area ID
//   6. GET  /internal/venue/area/by-seat  → Lấy area info từ seat ID
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// VenueInternalHandler xử lý các request nội bộ từ service khác
type VenueInternalHandler struct {
	useCase *usecase.VenueUseCase
	logger  *logger.Logger
}

// NewVenueInternalHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewVenueInternalHandlerWithDB(dbConn *sql.DB) *VenueInternalHandler {
	return &VenueInternalHandler{
		useCase: usecase.NewVenueUseCaseWithDB(dbConn),
		logger:  logger.Default(),
	}
}

// ============================================================
//  1. HandleGetVenueInfo - GET /internal/venue/info?venueId=
//     Trả về thông tin venue (venueName, location, status)
//     Dùng bởi: event-lambda, ticket-lambda khi cần venue info
//
// ============================================================
func (h *VenueInternalHandler) HandleGetVenueInfo(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	venueIDStr := request.QueryStringParameters["venueId"]
	if venueIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "venueId required"})
	}

	venueID, err := strconv.Atoi(venueIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid venueId"})
	}

	venue, err := h.useCase.GetVenueByID(ctx, venueID)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get venue %d: %v", venueID, err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get venue"})
	}

	if venue == nil {
		return createInternalResponse(http.StatusNotFound, map[string]string{"error": "venue not found"})
	}

	// Trả về venue info (giữ nguyên struct JSON)
	response := models.Venue{
		VenueID:   venue.VenueID,
		VenueName: venue.VenueName,
		Location:  venue.Location,
		Status:    venue.Status,
	}

	h.logger.Info("[INTERNAL_VENUE] ✅ GetVenueInfo: venueId=%d, name=%s", venueID, venue.VenueName)
	return createInternalResponse(http.StatusOK, response)
}

// ============================================================
//  2. HandleGetAreaInfo - GET /internal/venue/area/info?areaId=
//     Trả về thông tin area (areaName, floor, capacity, venueId)
//     Dùng bởi: event-lambda khi cần area info
//
// ============================================================
func (h *VenueInternalHandler) HandleGetAreaInfo(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	areaIDStr := request.QueryStringParameters["areaId"]
	if areaIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "areaId required"})
	}

	areaID, err := strconv.Atoi(areaIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid areaId"})
	}

	// Lấy tất cả areas rồi filter (đơn giản, reuse code hiện có)
	areas, err := h.useCase.GetAllAreas(ctx)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get areas: %v", err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get areas"})
	}

	for _, area := range areas {
		if area.AreaID == areaID {
			h.logger.Info("[INTERNAL_VENUE] ✅ GetAreaInfo: areaId=%d, name=%s", areaID, area.AreaName)
			return createInternalResponse(http.StatusOK, area)
		}
	}

	return createInternalResponse(http.StatusNotFound, map[string]string{"error": "area not found"})
}

// ============================================================
//  3. HandleGetAreasByVenue - GET /internal/venue/areas?venueId=
//     Trả về danh sách areas của venue
//     Dùng bởi: event-lambda khi cần liệt kê areas trong venue
//
// ============================================================
func (h *VenueInternalHandler) HandleGetAreasByVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	venueIDStr := request.QueryStringParameters["venueId"]
	if venueIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "venueId required"})
	}

	venueID, err := strconv.Atoi(venueIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid venueId"})
	}

	areas, err := h.useCase.GetAreasByVenueID(ctx, venueID)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get areas for venue %d: %v", venueID, err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get areas"})
	}

	if areas == nil {
		areas = []models.VenueArea{}
	}

	h.logger.Info("[INTERNAL_VENUE] ✅ GetAreasByVenue: venueId=%d, count=%d", venueID, len(areas))
	return createInternalResponse(http.StatusOK, areas)
}

// ============================================================
//  4. HandleGetSeatInfo - GET /internal/venue/seat/info?seatId=
//     Trả về thông tin seat (seatCode, areaId, status)
//     Dùng bởi: ticket-lambda khi cần seat info cho vé
//
// ============================================================
func (h *VenueInternalHandler) HandleGetSeatInfo(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	seatIDStr := request.QueryStringParameters["seatId"]
	if seatIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "seatId required"})
	}

	seatID, err := strconv.Atoi(seatIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid seatId"})
	}

	// Lấy seat info từ area-based query
	// Trước tiên cần lấy area_id từ seat
	areaIDStr := request.QueryStringParameters["areaId"]
	if areaIDStr == "" {
		// Nếu không có areaId, trả lỗi
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "areaId required for seat lookup"})
	}

	areaID, err := strconv.Atoi(areaIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid areaId"})
	}

	seats, err := h.useCase.GetAllSeats(ctx, areaID)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get seats for area %d: %v", areaID, err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get seats"})
	}

	for _, seat := range seats {
		if seat.SeatID == seatID {
			h.logger.Info("[INTERNAL_VENUE] ✅ GetSeatInfo: seatId=%d, code=%s", seatID, seat.SeatCode)
			return createInternalResponse(http.StatusOK, seat)
		}
	}

	return createInternalResponse(http.StatusNotFound, map[string]string{"error": fmt.Sprintf("seat %d not found in area %d", seatID, areaID)})
}

// ============================================================
//  5. HandleGetSeatsByArea - GET /internal/venue/seats?areaId=
//     Trả về danh sách seats của area
//     Dùng bởi: ticket-lambda, event-lambda khi cần seat layout
//
// ============================================================
func (h *VenueInternalHandler) HandleGetSeatsByArea(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	areaIDStr := request.QueryStringParameters["areaId"]
	if areaIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "areaId required"})
	}

	areaID, err := strconv.Atoi(areaIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid areaId"})
	}

	seats, err := h.useCase.GetAllSeats(ctx, areaID)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get seats for area %d: %v", areaID, err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get seats"})
	}

	if seats == nil {
		seats = []models.Seat{}
	}

	h.logger.Info("[INTERNAL_VENUE] ✅ GetSeatsByArea: areaId=%d, count=%d", areaID, len(seats))
	return createInternalResponse(http.StatusOK, seats)
}

// ============================================================
//  6. HandleGetAreaBySeat - GET /internal/venue/area/by-seat?seatId=
//     Trả về area info từ seat ID (reverse lookup)
//     Dùng bởi: ticket-lambda khi chỉ có seatId, cần venue info
//
// ============================================================
func (h *VenueInternalHandler) HandleGetAreaBySeat(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	seatIDStr := request.QueryStringParameters["seatId"]
	if seatIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "seatId required"})
	}

	seatID, err := strconv.Atoi(seatIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid seatId"})
	}

	// Lấy area_id từ seat trực tiếp qua DB (cùng venue domain)
	areas, err := h.useCase.GetAllAreas(ctx)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get areas: %v", err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get areas"})
	}

	// Tìm area chứa seat này bằng cách check từng area
	for _, area := range areas {
		seats, err := h.useCase.GetAllSeats(ctx, area.AreaID)
		if err != nil {
			continue
		}
		for _, seat := range seats {
			if seat.SeatID == seatID {
				h.logger.Info("[INTERNAL_VENUE] ✅ GetAreaBySeat: seatId=%d → areaId=%d", seatID, area.AreaID)
				return createInternalResponse(http.StatusOK, area)
			}
		}
	}

	return createInternalResponse(http.StatusNotFound, map[string]string{"error": "area not found for seat"})
}

// ============================================================
//  7. HandleGetAreaWithVenue - GET /internal/venue/area-with-venue?areaId=
//     Trả về thông tin area + venue cha (areaName, floor, capacity, venueName, location)
//     Dùng bởi: event-lambda khi cần thay thế JOIN Venue_Area + Venue
//
// ============================================================
func (h *VenueInternalHandler) HandleGetAreaWithVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	areaIDStr := request.QueryStringParameters["areaId"]
	if areaIDStr == "" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "areaId required"})
	}

	areaID, err := strconv.Atoi(areaIDStr)
	if err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid areaId"})
	}

	// Lấy area info
	areas, err := h.useCase.GetAllAreas(ctx)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get areas: %v", err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get areas"})
	}

	var targetArea *models.VenueArea
	for _, area := range areas {
		if area.AreaID == areaID {
			targetArea = &area
			break
		}
	}

	if targetArea == nil {
		return createInternalResponse(http.StatusNotFound, map[string]string{"error": "area not found"})
	}

	// Lấy venue info
	venue, err := h.useCase.GetVenueByID(ctx, targetArea.VenueID)
	if err != nil || venue == nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get venue %d: %v", targetArea.VenueID, err)
		// Trả area info mà không có venue
		response := map[string]interface{}{
			"areaId":   targetArea.AreaID,
			"areaName": targetArea.AreaName,
			"floor":    targetArea.Floor,
			"capacity": targetArea.Capacity,
			"venueId":  targetArea.VenueID,
			"status":   targetArea.Status,
		}
		return createInternalResponse(http.StatusOK, response)
	}

	// Trả về combined area + venue info
	response := map[string]interface{}{
		"areaId":        targetArea.AreaID,
		"areaName":      targetArea.AreaName,
		"floor":         targetArea.Floor,
		"capacity":      targetArea.Capacity,
		"venueId":       targetArea.VenueID,
		"status":        targetArea.Status,
		"venueName":     venue.VenueName,
		"venueLocation": venue.Location,
	}

	h.logger.Info("[INTERNAL_VENUE] ✅ GetAreaWithVenue: areaId=%d, area=%s, venue=%s", areaID, targetArea.AreaName, venue.VenueName)
	return createInternalResponse(http.StatusOK, response)
}

// ============================================================
//  8. HandleUpdateAreaStatus - POST /internal/venue/area-status
//     Cập nhật status của area (AVAILABLE/UNAVAILABLE)
//     Dùng bởi: event-lambda khi approve/cancel event (thay thế UPDATE trực tiếp)
//     Body: {"areaId": 1, "status": "UNAVAILABLE"}
//
// ============================================================
func (h *VenueInternalHandler) HandleUpdateAreaStatus(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isInternalCall(request) {
		return createInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var body struct {
		AreaID int    `json:"areaId"`
		Status string `json:"status"`
	}

	if err := json.Unmarshal([]byte(request.Body), &body); err != nil {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if body.AreaID == 0 {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "areaId required"})
	}

	if body.Status != "AVAILABLE" && body.Status != "UNAVAILABLE" {
		return createInternalResponse(http.StatusBadRequest, map[string]string{"error": "status must be AVAILABLE or UNAVAILABLE"})
	}

	// Dùng UpdateArea với chỉ status change
	// Lấy area hiện tại trước
	areas, err := h.useCase.GetAllAreas(ctx)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to get areas: %v", err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get areas"})
	}

	var targetArea *models.VenueArea
	for _, area := range areas {
		if area.AreaID == body.AreaID {
			targetArea = &area
			break
		}
	}

	if targetArea == nil {
		return createInternalResponse(http.StatusNotFound, map[string]string{"error": "area not found"})
	}

	// Update area status
	floor := 0
	if targetArea.Floor != nil {
		floor, _ = strconv.Atoi(*targetArea.Floor)
	}
	capacity := 0
	if targetArea.Capacity != nil {
		capacity = *targetArea.Capacity
	}

	updateReq := models.UpdateAreaRequest{
		AreaID:   body.AreaID,
		AreaName: targetArea.AreaName,
		Floor:    floor,
		Capacity: capacity,
		Status:   body.Status,
	}

	err = h.useCase.UpdateArea(ctx, updateReq)
	if err != nil {
		h.logger.Warn("[INTERNAL_VENUE] Failed to update area %d status to %s: %v", body.AreaID, body.Status, err)
		return createInternalResponse(http.StatusInternalServerError, map[string]string{"error": "failed to update area status"})
	}

	h.logger.Info("[INTERNAL_VENUE] ✅ UpdateAreaStatus: areaId=%d → %s", body.AreaID, body.Status)
	return createInternalResponse(http.StatusOK, map[string]interface{}{
		"success": true,
		"areaId":  body.AreaID,
		"status":  body.Status,
	})
}

// ============================================================
// HELPERS
// ============================================================

// isInternalCall kiểm tra header X-Internal-Call
func isInternalCall(request events.APIGatewayProxyRequest) bool {
	return utils.IsValidInternalToken(request.Headers)
}

// createInternalResponse tạo JSON response cho internal APIs
func createInternalResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
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
