package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/venue-lambda/models"
	"github.com/fpt-event-services/services/venue-lambda/usecase"
)

type VenueHandler struct {
	useCase *usecase.VenueUseCase
}

func NewVenueHandler() *VenueHandler {
	return &VenueHandler{
		useCase: usecase.NewVenueUseCase(),
	}
}

// HandleGetVenues - GET /api/venues
func (h *VenueHandler) HandleGetVenues(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	venues, err := h.useCase.GetAllVenues(ctx)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading venues")
	}

	if venues == nil {
		venues = []models.Venue{}
	}

	return createJSONResponse(http.StatusOK, venues)
}

// HandleCreateVenue - POST /api/venues
func (h *VenueHandler) HandleCreateVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN only)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	var req models.CreateVenueRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.VenueName == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Venue name is required")
	}

	_, err := h.useCase.CreateVenue(ctx, req)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", "Error creating venue")
	}

	return createStatusResponse(http.StatusCreated, "success", "Venue created successfully")
}

// HandleUpdateVenue - PUT /api/venues
func (h *VenueHandler) HandleUpdateVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	var req models.UpdateVenueRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body")
	}

	if req.VenueID == 0 {
		return createStatusResponse(http.StatusBadRequest, "fail", "Venue ID is required")
	}

	err := h.useCase.UpdateVenue(ctx, req)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", "Error updating venue")
	}

	return createStatusResponse(http.StatusOK, "success", "Venue updated successfully")
}

// HandleDeleteVenue - DELETE /api/venues?venueId=
func (h *VenueHandler) HandleDeleteVenue(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	venueIDStr := request.QueryStringParameters["venueId"]
	if venueIDStr == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mã địa điểm là bắt buộc")
	}

	venueID, err := strconv.Atoi(venueIDStr)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mã địa điểm không hợp lệ")
	}

	err = h.useCase.DeleteVenue(ctx, venueID)
	if err != nil {
		errMsg := err.Error()

		// Check if it's a validation error (constraint check failed)
		if strings.Contains(errMsg, "VALIDATION_ERROR:") {
			// Extract the message after the prefix
			message := strings.TrimPrefix(errMsg, "VALIDATION_ERROR:")
			return createStatusResponse(http.StatusBadRequest, "fail", message)
		}

		// Otherwise it's a server error
		return createStatusResponse(http.StatusInternalServerError, "fail", "Lỗi xóa địa điểm: "+errMsg)
	}

	return createStatusResponse(http.StatusOK, "success", "Địa điểm được ẩn thành công")
}

// HandleGetAreas - GET /api/venue-areas
func (h *VenueHandler) HandleGetAreas(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check if venueId parameter exists
	venueIDStr := request.QueryStringParameters["venueId"]
	var areas []models.VenueArea
	var err error

	// DEBUG LOG
	fmt.Printf("[DEBUG] HandleGetAreas called with venueId parameter: '%s'\n", venueIDStr)

	if venueIDStr != "" {
		// Get areas by venue ID
		venueID, parseErr := strconv.Atoi(venueIDStr)
		if parseErr != nil {
			return createStatusResponse(http.StatusBadRequest, "fail", "Invalid venueId format")
		}
		fmt.Printf("[DEBUG] Calling GetAreasByVenueID with venueID=%d\n", venueID)
		areas, err = h.useCase.GetAreasByVenueID(ctx, venueID)
	} else {
		// Get all areas
		fmt.Println("[DEBUG] Calling GetAllAreas (no venueId parameter)")
		areas, err = h.useCase.GetAllAreas(ctx)
	}

	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading areas")
	}

	if areas == nil {
		areas = []models.VenueArea{}
	}

	return createJSONResponse(http.StatusOK, areas)
}

// HandleCreateArea - POST /api/venues/areas
func (h *VenueHandler) HandleCreateArea(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	var req models.CreateAreaRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body: dữ liệu yêu cầu không hợp lệ")
	}

	// Validation logic
	if req.AreaName == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Tên phòng không được để trống")
	}

	if req.VenueID == 0 {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mã địa điểm không hợp lệ")
	}

	// Validate capacity
	if req.Capacity <= 0 {
		return createStatusResponse(http.StatusBadRequest, "fail", "Sức chứa phải lớn hơn 0")
	}

	_, err := h.useCase.CreateArea(ctx, req)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", "Lỗi tạo phòng: "+err.Error())
	}

	return createStatusResponse(http.StatusCreated, "success", "Area created successfully")
}

// HandleUpdateArea - PUT /api/venues/areas
func (h *VenueHandler) HandleUpdateArea(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	var req models.UpdateAreaRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid request body: dữ liệu yêu cầu không hợp lệ")
	}

	// Validation logic
	if req.AreaID == 0 {
		return createStatusResponse(http.StatusBadRequest, "fail", "Mã phòng không hợp lệ")
	}

	if req.AreaName == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Tên phòng không được để trống")
	}

	// Validate capacity
	if req.Capacity <= 0 {
		return createStatusResponse(http.StatusBadRequest, "fail", "Sức chứa phải lớn hơn 0")
	}

	err := h.useCase.UpdateArea(ctx, req)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", "Lỗi cập nhật phòng: "+err.Error())
	}

	return createStatusResponse(http.StatusOK, "success", "Area updated successfully")
}

// HandleDeleteArea - DELETE /api/venue-areas?id=
func (h *VenueHandler) HandleDeleteArea(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createStatusResponse(http.StatusForbidden, "fail", "ADMIN role required")
	}

	areaIDStr := request.QueryStringParameters["id"]
	if areaIDStr == "" {
		return createStatusResponse(http.StatusBadRequest, "fail", "Area ID is required")
	}

	areaID, err := strconv.Atoi(areaIDStr)
	if err != nil {
		return createStatusResponse(http.StatusBadRequest, "fail", "Invalid area ID")
	}

	err = h.useCase.DeleteArea(ctx, areaID)
	if err != nil {
		return createStatusResponse(http.StatusInternalServerError, "fail", "Error deleting area")
	}

	return createStatusResponse(http.StatusOK, "success", "Area deleted successfully")
}

// HandleGetFreeAreas - GET /api/free-areas?startTime=&endTime=
func (h *VenueHandler) HandleGetFreeAreas(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	startTime := request.QueryStringParameters["startTime"]
	endTime := request.QueryStringParameters["endTime"]

	if startTime == "" || endTime == "" {
		return createMessageResponse(http.StatusBadRequest, "startTime and endTime are required")
	}

	areas, err := h.useCase.GetFreeAreas(ctx, startTime, endTime)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading free areas")
	}

	if areas == nil {
		areas = []models.FreeAreaResponse{}
	}

	// Wrap response to match Java backend format
	response := map[string]interface{}{
		"status":      "success",
		"startTime":   startTime,
		"endTime":     endTime,
		"bufferHours": 1,
		"total":       len(areas),
		"areas":       areas,
	}

	return createJSONResponse(http.StatusOK, response)
}

// HandleGetSeats - GET /api/seats?areaId=&eventId=&seatType=
// Tương tự Java GetAllSeatsController:
// - Nếu có eventId: lấy ghế từ Event_Seat_Layout (layout cho event cụ thể)
// - Nếu không có eventId: lấy ghế vật lý từ Seat (theo area)
func (h *VenueHandler) HandleGetSeats(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	eventIDStr := request.QueryStringParameters["eventId"]
	areaIDStr := request.QueryStringParameters["areaId"]
	seatType := request.QueryStringParameters["seatType"] // VIP or STANDARD

	var seats []models.Seat
	var err error
	var eventID *int
	var areaID *int

	// CASE 1: Có eventId -> lấy ghế theo event (Event_Seat_Layout)
	if eventIDStr != "" {
		eid, parseErr := strconv.Atoi(eventIDStr)
		if parseErr != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid eventId")
		}
		eventID = &eid

		// Lấy ghế theo event, có thể filter theo seatType
		seats, err = h.useCase.GetSeatsForEvent(ctx, eid, seatType)
		if err != nil {
			return createMessageResponse(http.StatusInternalServerError, "Error loading seats for event")
		}

		// Nếu có ghế, lấy areaID từ ghế đầu tiên
		if len(seats) > 0 {
			aid := seats[0].AreaID
			areaID = &aid
		}

	} else {
		// CASE 2: Không có eventId -> bắt buộc phải có areaId
		if areaIDStr == "" {
			return createMessageResponse(http.StatusBadRequest, "Missing areaId or eventId")
		}

		aid, parseErr := strconv.Atoi(areaIDStr)
		if parseErr != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid areaId")
		}
		areaID = &aid

		// Lấy ghế vật lý theo area
		seats, err = h.useCase.GetAllSeats(ctx, aid)
		if err != nil {
			return createMessageResponse(http.StatusInternalServerError, "Error loading seats")
		}
	}

	if seats == nil {
		seats = []models.Seat{}
	}

	// Trả response theo format Java: { eventId, areaId, seatType, total, seats }
	response := map[string]interface{}{
		"eventId":  eventID,
		"areaId":   areaID,
		"seatType": seatType,
		"total":    len(seats),
		"seats":    seats,
	}

	return createJSONResponse(http.StatusOK, response)
}

// Helper functions
func createJSONResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    defaultHeaders(),
			Body:       `{"message":"Failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

func createMessageResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{"message": message})
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

func createStatusResponse(statusCode int, status, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{"status": status, "message": message})
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    defaultHeaders(),
		Body:       string(body),
	}, nil
}

func defaultHeaders() map[string]string {
	return map[string]string{
		"Content-Type":                     "application/json;charset=UTF-8",
		"Access-Control-Allow-Origin":      "*",
		"Access-Control-Allow-Credentials": "true",
	}
}
