package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-lambda/models"
	"github.com/fpt-event-services/services/event-lambda/repository"
	"github.com/fpt-event-services/services/event-lambda/usecase"
)

var log = logger.Default()

// EventHandler handles event-related requests
type EventHandler struct {
	useCase *usecase.EventUseCase
}

// NewEventHandlerWithDB creates a new event handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewEventHandlerWithDB(dbConn *sql.DB) *EventHandler {
	return &EventHandler{
		useCase: usecase.NewEventUseCaseWithDB(dbConn),
	}
}

// HandleGetEvents handles GET /api/events
// Response format khớp với Java Backend:
//
//	{
//	  "openEvents": [...],
//	  "closedEvents": [...]
//	}
//
// Permission Logic:
// - Nếu Role == 'ADMIN': Trả về toàn bộ danh sách
// - Nếu Role == 'ORGANIZER': Chỉ trả về các sự kiện có organizer_id == userID
// - Nếu Role == ” (public/guest): Trả về toàn bộ danh sách
func (h *EventHandler) HandleGetEvents(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract user info from headers (set by authMiddleware)
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"]
	userID := 0

	if userIDStr != "" {
		var err error
		userID, err = strconv.Atoi(userIDStr)
		if err != nil {
			log.Warn("HandleGetEvents - Invalid X-User-Id: %s", userIDStr)
		}
	}

	// Default to public access if role is empty (guest/not logged in)
	if role == "" {
		role = "PUBLIC"
	}

	// ✅ NEW: Parse pagination parameters from query string
	pageStr := request.QueryStringParameters["page"]
	limitStr := request.QueryStringParameters["limit"]

	page := 1
	limit := 10

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	log.Debug("HandleGetEvents - Role=%s UserID=%d Page=%d Limit=%d", role, userID, page, limit)

	// Get all events separated by status with pagination
	openEvents, closedEvents, totalOpen, totalClosed, err := h.useCase.GetAllEventsSeparatedWithPagination(ctx, role, userID, page, limit)
	if err != nil {
		log.Error("GetAllEventsSeparatedWithPagination error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Internal server error when loading events: %v", err))
	}

	// Return empty arrays if nil
	if openEvents == nil {
		openEvents = []models.EventListItem{}
	}
	if closedEvents == nil {
		closedEvents = []models.EventListItem{}
	}

	// Calculate pagination metadata
	totalItems := totalOpen + totalClosed
	totalPages := (totalItems + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	// ✅ SECURITY LOG: Track filtered events access
	log.Info("GetEvents filtered - UserID=%d Role=%s Page=%d TotalItems=%d Open=%d Closed=%d",
		userID, role, page, totalItems, len(openEvents), len(closedEvents))

	// ✅ NEW RESPONSE FORMAT with pagination metadata
	response := map[string]interface{}{
		"openEvents":   openEvents,
		"closedEvents": closedEvents,
		"pagination": map[string]int{
			"currentPage": page,
			"pageSize":    limit,
			"totalItems":  totalItems,
			"totalPages":  totalPages,
		},
	}

	return createJSONResponse(http.StatusOK, response)
}

// HandleGetOpenEvents handles GET /api/events/open
// Trả về danh sách events có status OPEN
func (h *EventHandler) HandleGetOpenEvents(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	events, err := h.useCase.GetOpenEvents(ctx)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading open events")
	}

	if events == nil {
		events = []models.EventListItem{}
	}

	return createJSONResponse(http.StatusOK, events)
}

// HandleGetEventDetail handles GET /api/events/detail?id={eventId}
// Response format khớp với Java: trả trực tiếp EventDetailDto object
func (h *EventHandler) HandleGetEventDetail(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get event ID from query parameter (khớp với Java: ?id=...)
	eventIDStr := request.QueryStringParameters["id"]
	if eventIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Missing event id")
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid event id")
	}

	// Get event detail
	event, err := h.useCase.GetEventDetail(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading event detail")
	}

	if event == nil {
		return createMessageResponse(http.StatusNotFound, "Event not found")
	}

	// Trả trực tiếp object (khớp với Java Backend)
	return createJSONResponse(http.StatusOK, event)
}

// createJSONResponse creates a JSON response (trả trực tiếp data, không wrap)
func createJSONResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers: map[string]string{
				"Content-Type":                     "application/json;charset=UTF-8",
				"Access-Control-Allow-Origin":      "*",
				"Access-Control-Allow-Credentials": "true",
			},
			Body: `{"message":"Failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                     "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin":      "*",
			"Access-Control-Allow-Credentials": "true",
		},
		Body: string(body),
	}, nil
}

// createMessageResponse creates error response with message (khớp với Java: {"message": "..."})
func createMessageResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"message": message,
	})

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                     "application/json;charset=UTF-8",
			"Access-Control-Allow-Origin":      "*",
			"Access-Control-Allow-Credentials": "true",
		},
		Body: string(body),
	}, nil
}

// ============================================================
// HandleCreateEventRequest - POST /api/event-requests
// Tạo yêu cầu sự kiện mới (ORGANIZER only)
// KHỚP VỚI Java CreateEventRequestController
// ============================================================
func (h *EventHandler) HandleCreateEventRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get user ID from request context (set by auth middleware)
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Check role (ORGANIZER only)
	role := request.Headers["X-User-Role"]
	if role != "ORGANIZER" && role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Only ORGANIZER can create event requests")
	}

	// Parse request body
	var req models.CreateEventRequestBody
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate required fields
	if req.Title == "" {
		return createMessageResponse(http.StatusBadRequest, "Title is required")
	}
	if req.PreferredStartTime == "" || req.PreferredEndTime == "" {
		return createMessageResponse(http.StatusBadRequest, "Start time and end time are required")
	}

	// Parse and validate time
	log.Debug("HandleCreateEventRequest - Parsing times Start=%s End=%s", req.PreferredStartTime, req.PreferredEndTime)
	startTime, err := ParseEventTime(req.PreferredStartTime)
	if err != nil {
		log.Warn("HandleCreateEventRequest - Failed to parse start time: %v", err)
		return createMessageResponse(http.StatusBadRequest, "Invalid start time format")
	}
	endTime, err := ParseEventTime(req.PreferredEndTime)
	if err != nil {
		log.Warn("HandleCreateEventRequest - Failed to parse end time: %v", err)
		return createMessageResponse(http.StatusBadRequest, "Invalid end time format")
	}
	log.Debug("HandleCreateEventRequest - Parsed times Start=%s End=%s", startTime.Format("2006-01-02 15:04:05"), endTime.Format("2006-01-02 15:04:05"))

	// Validate event time rules
	if err := ValidateEventTime(startTime, endTime); err != nil {
		log.Warn("HandleCreateEventRequest - Time validation failed: %v", err.Error())
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	// Create event request
	requestID, err := h.useCase.CreateEventRequest(ctx, userID, &req)
	if err != nil {
		log.Error("HandleCreateEventRequest - Failed to create event request: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Error creating event request")
	}

	log.Info("HandleCreateEventRequest - Created request ID=%d", requestID)
	return createJSONResponse(http.StatusOK, map[string]interface{}{
		"message":   "Event request created successfully",
		"requestId": requestID,
	})
}

// ============================================================
// HandleGetMyEventRequests - GET /api/event-requests/my-requests
// Lấy danh sách yêu cầu của user
// KHỚP VỚI Java GetMyEventRequestsController
// ============================================================
func (h *EventHandler) HandleGetMyEventRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get user ID from request context
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Get event requests
	requests, err := h.useCase.GetMyEventRequests(ctx, userID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading event requests")
	}

	if requests == nil {
		requests = []models.EventRequest{}
	}

	return createJSONResponse(http.StatusOK, requests)
}

// ============================================================
// HandleGetMyActiveEventRequests - GET /api/event-requests/my/active
// Lấy yêu cầu hoạt động (tab "Chờ")
// Active = (PENDING OR UPDATING) OR (APPROVED AND endTime > NOW)
// Query params: limit, offset
// ============================================================
func (h *EventHandler) HandleGetMyActiveEventRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get user ID from request context
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Get limit and offset from query params (defaults: limit=10, offset=0)
	limit := 10
	offset := 0
	if val, ok := request.QueryStringParameters["limit"]; ok {
		if l, err := strconv.Atoi(val); err == nil {
			limit = l
		}
	}
	if val, ok := request.QueryStringParameters["offset"]; ok {
		if o, err := strconv.Atoi(val); err == nil {
			offset = o
		}
	}

	// Get active event requests
	result, err := h.useCase.GetMyActiveEventRequests(ctx, userID, limit, offset)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading active event requests")
	}

	if result == nil {
		result = &usecase.MyActiveEventRequestsResult{
			Requests:   []models.EventRequest{},
			TotalCount: 0,
		}
	}

	return createJSONResponse(http.StatusOK, result)
}

// ============================================================
// HandleGetMyArchivedEventRequests - GET /api/event-requests/my/archived
// Lấy yêu cầu đã lưu trữ (tab "Đã xử lý")
// Archived = (REJECTED OR CANCELLED OR FINISHED) OR (APPROVED AND endTime <= NOW)
// Query params: limit, offset
// ============================================================
func (h *EventHandler) HandleGetMyArchivedEventRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get user ID from request context
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Get limit and offset from query params (defaults: limit=10, offset=0)
	limit := 10
	offset := 0
	if val, ok := request.QueryStringParameters["limit"]; ok {
		if l, err := strconv.Atoi(val); err == nil {
			limit = l
		}
	}
	if val, ok := request.QueryStringParameters["offset"]; ok {
		if o, err := strconv.Atoi(val); err == nil {
			offset = o
		}
	}

	// Get archived event requests
	result, err := h.useCase.GetMyArchivedEventRequests(ctx, userID, limit, offset)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading archived event requests")
	}

	if result == nil {
		result = &usecase.MyArchivedEventRequestsResult{
			Requests:   []models.EventRequest{},
			TotalCount: 0,
		}
	}

	return createJSONResponse(http.StatusOK, result)
}

// ============================================================
// HandleGetEventRequestByID - GET /api/event-requests/:id
// Lấy chi tiết một event request cụ thể (join với venue area info)
// Trả về dữ liệu: title, description, venue info (venueName, areaName, floor, areaCapacity), ...
// ============================================================
func (h *EventHandler) HandleGetEventRequestByID(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get request ID from path parameters (Lambda mode) or fallback to parsing path (local mode)
	requestIDStr := request.PathParameters["id"]

	// Fallback: if PathParameters is empty (local HTTP server), parse from path
	if requestIDStr == "" {
		// Parse /api/event-requests/1055 → extract "1055"
		parts := strings.Split(strings.TrimSuffix(request.Path, "/"), "/")
		if len(parts) > 0 {
			requestIDStr = parts[len(parts)-1]
		}
		log.Debug("GetEventRequestByID - Extracted ID from path: %s (full path: %s)", requestIDStr, request.Path)
	}

	if requestIDStr == "" {
		log.Warn("GetEventRequestByID - ID is empty Path=%s PathParams=%v", request.Path, request.PathParameters)
		return createMessageResponse(http.StatusBadRequest, "Event request ID is required")
	}

	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		log.Warn("GetEventRequestByID - Invalid ID format '%s': %v", requestIDStr, err)
		return createMessageResponse(http.StatusBadRequest, "Invalid request ID format")
	}

	log.Debug("GetEventRequestByID - Fetching request ID=%d", requestID)

	// Get event request detail with venue info
	eventRequest, err := h.useCase.GetEventRequestByID(ctx, requestID)
	if err != nil {
		log.Error("GetEventRequestByID failed ID=%d: %v", requestID, err)
		return createMessageResponse(http.StatusInternalServerError, "Error fetching event request")
	}

	if eventRequest == nil {
		log.Warn("GetEventRequestByID - Not found requestID=%d", requestID)
		return createMessageResponse(http.StatusNotFound, "Event request not found")
	}

	log.Debug("GetEventRequestByID - SUCCESS requestID=%d Title=%s", requestID, eventRequest.Title)
	return createJSONResponse(http.StatusOK, eventRequest)
}

// ============================================================
// HandleGetPendingEventRequests - GET /api/event-requests/pending
// Lấy danh sách yêu cầu chờ duyệt (ADMIN/STAFF)
// KHỚP VỚI Java GetPendingEventRequestsController
// ============================================================
func (h *EventHandler) HandleGetPendingEventRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN or STAFF)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" && role != "STAFF" {
		return createMessageResponse(http.StatusForbidden, "Admin or Staff access required")
	}

	// Get pending event requests
	requests, err := h.useCase.GetPendingEventRequests(ctx)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading pending event requests")
	}

	if requests == nil {
		requests = []models.EventRequest{}
	}

	return createJSONResponse(http.StatusOK, requests)
}

// ============================================================
// HandleProcessEventRequest - POST /api/event-requests/process
// Duyệt hoặc từ chối yêu cầu (STAFF/ADMIN)
// KHỚP VỚI Java ProcessEventRequestController
// ============================================================
func (h *EventHandler) HandleProcessEventRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (STAFF or ADMIN)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" && role != "STAFF" {
		return createMessageResponse(http.StatusForbidden, "STAFF or ADMIN access required")
	}

	// Get staff/admin ID
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Parse request body
	var req models.ProcessEventRequestBody
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate
	if req.RequestID == 0 {
		return createMessageResponse(http.StatusBadRequest, "Request ID is required")
	}
	if req.Action != "APPROVED" && req.Action != "REJECTED" {
		return createMessageResponse(http.StatusBadRequest, "Action must be APPROVED or REJECTED")
	}

	// Log request details
	log.Info("ProcessEventRequest - RequestID=%d Action=%s AreaID=%v SpeakerID=%v",
		req.RequestID, req.Action, req.AreaID, req.SpeakerID)

	// Process event request
	err := h.useCase.ProcessEventRequest(ctx, userID, &req)
	if err != nil {
		log.Error("ProcessEventRequest failed RequestID=%d: %v", req.RequestID, err)
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Error processing event request: %v", err))
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Event request processed successfully",
	})
}

// ============================================================
// HandleUpdateEventRequest - POST /api/event-requests/update
// Cập nhật thông tin yêu cầu sự kiện (ORGANIZER)
// Organizer cập nhật request ở tab "Đã xử lý" (status = APPROVED)
// Sau khi update, request status sẽ chuyển thành UPDATING
// NOTE: Core fields (title, description, times, capacity) không được phép thay đổi
// Chỉ có thể thay đổi: speaker info, tickets, banner
// ============================================================
func (h *EventHandler) HandleUpdateEventRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role - chỉ ORGANIZER hoặc ADMIN mới có thể update
	role := request.Headers["X-User-Role"]
	if role != "ORGANIZER" && role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "ORGANIZER access required")
	}

	// Get organizer ID
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized")
	}
	userID, _ := strconv.Atoi(userIDStr)

	// Parse request body
	var req models.UpdateEventRequestRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate request
	if req.RequestID == 0 {
		return createMessageResponse(http.StatusBadRequest, "Request ID is required")
	}

	// 🔑 Status must be UPDATING
	if req.Status != "UPDATING" {
		req.Status = "UPDATING"
	}

	// Log update request
	log.Info("UpdateEventRequest - RequestID=%d UserID=%d Status=%s", req.RequestID, userID, req.Status)

	// ===== BUSINESS LOGIC GUARDS - Check if event can be updated =====
	// Get the related event to check status and start time
	eventEligible, eligibilityError := h.useCase.CheckEventUpdateEligibility(ctx, req.RequestID)
	if eligibilityError != nil {
		log.Warn("CheckEventUpdateEligibility failed RequestID=%d: %v", req.RequestID, eligibilityError)

		// Parse error message to determine HTTP status code
		if eligibilityError.Code == "EVENT_CLOSED" {
			return createMessageResponse(http.StatusForbidden, eligibilityError.Message)
		}
		// Default to 400 for other validation errors
		return createMessageResponse(http.StatusBadRequest, eligibilityError.Message)
	}

	if !eventEligible {
		return createMessageResponse(http.StatusForbidden, "Event is not eligible for update")
	}

	// ===== GUARD: Core fields cannot be changed =====
	// If core fields are provided, check that they match the original values
	// Fetch original event request data to compare
	if req.Title != "" || req.Description != "" || req.PreferredStartTime != "" || req.PreferredEndTime != "" || req.ExpectedCapacity > 0 {
		// Get original event request to compare
		originalRequest, err := h.useCase.GetEventRequestByID(ctx, req.RequestID)
		if err != nil {
			log.Error("GetEventRequestByID failed RequestID=%d: %v", req.RequestID, err)
			return createMessageResponse(http.StatusInternalServerError, "Error retrieving original request")
		}

		if originalRequest == nil {
			return createMessageResponse(http.StatusNotFound, "Event request not found")
		}

		// Check if any core field was changed
		if req.Title != "" && req.Title != originalRequest.Title {
			return createMessageResponse(http.StatusForbidden, "Không được phép thay đổi tên sự kiện")
		}

		// Description is a pointer in originalRequest
		originalDesc := ""
		if originalRequest.Description != nil {
			originalDesc = *originalRequest.Description
		}
		if req.Description != "" && req.Description != originalDesc {
			return createMessageResponse(http.StatusForbidden, "Không được phép thay đổi mô tả sự kiện")
		}

		// PreferredStartTime is a pointer
		originalStartTime := ""
		if originalRequest.PreferredStartTime != nil {
			originalStartTime = *originalRequest.PreferredStartTime
		}
		if req.PreferredStartTime != "" && req.PreferredStartTime != originalStartTime {
			return createMessageResponse(http.StatusForbidden, "Không được phép thay đổi thời gian bắt đầu")
		}

		// PreferredEndTime is a pointer
		originalEndTime := ""
		if originalRequest.PreferredEndTime != nil {
			originalEndTime = *originalRequest.PreferredEndTime
		}
		if req.PreferredEndTime != "" && req.PreferredEndTime != originalEndTime {
			return createMessageResponse(http.StatusForbidden, "Không được phép thay đổi thời gian kết thúc")
		}

		// ExpectedCapacity is a pointer
		originalCapacity := 0
		if originalRequest.ExpectedCapacity != nil {
			originalCapacity = *originalRequest.ExpectedCapacity
		}
		if req.ExpectedCapacity > 0 && req.ExpectedCapacity != originalCapacity {
			return createMessageResponse(http.StatusForbidden, "Không được phép thay đổi sức chứa dự kiến")
		}
	}

	// Call use case to update request
	err := h.useCase.UpdateEventRequest(ctx, userID, &req)
	if err != nil {
		log.Error("UpdateEventRequest failed RequestID=%d: %v", req.RequestID, err)
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Error updating event request: %v", err))
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Event request updated successfully",
	})
}

// ============================================================
// HandleUpdateEvent - PUT /api/events/update
// Cập nhật thông tin event (ORGANIZER/ADMIN)
// KHỚP VỚI Java UpdateEventDetailController
// ============================================================
func (h *EventHandler) HandleUpdateEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role
	role := request.Headers["X-User-Role"]
	if role != "ORGANIZER" && role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Access denied")
	}

	// Parse request body
	var req models.UpdateEventRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate
	if req.EventID == 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID is required")
	}
	if req.Title == "" {
		return createMessageResponse(http.StatusBadRequest, "Title is required")
	}

	// Parse and validate time if provided
	if req.StartTime != "" && req.EndTime != "" {
		startTime, err := ParseEventTime(req.StartTime)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid start time format")
		}
		endTime, err := ParseEventTime(req.EndTime)
		if err != nil {
			return createMessageResponse(http.StatusBadRequest, "Invalid end time format")
		}

		// Validate event time rules
		if err := ValidateEventTime(startTime, endTime); err != nil {
			return createMessageResponse(http.StatusBadRequest, err.Error())
		}
	}

	// Update event
	err := h.useCase.UpdateEvent(ctx, &req)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error updating event")
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Event updated successfully",
	})
}

// ============================================================
// HandleUpdateEventDetails - POST /api/events/update-details
// Cập nhật speaker và tickets (ORGANIZER và ADMIN)
// KHỚP VỚI Java UpdateEventDetailsController
// ============================================================
func (h *EventHandler) HandleUpdateEventDetails(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role - cho phép cả ADMIN và ORGANIZER
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"] // Note: Go canonicalizes to X-User-Id, not X-User-ID

	// ✅ FIX: Cho phép cả ADMIN và ORGANIZER (giống Java)
	if role != "ORGANIZER" && role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Only Organizer or Admin can update event details")
	}

	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "User ID not found in request")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusUnauthorized, fmt.Sprintf("Invalid user ID: %s", userIDStr))
	}

	// Parse request body
	var req models.UpdateEventDetailsRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate
	if req.EventID == 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID is required")
	}

	// Update event details (speaker + tickets + banner)
	// ✅ FIX: Pass role để Repository có thể bypass ownership check cho Admin
	err = h.useCase.UpdateEventDetails(ctx, userID, role, &req)
	if err != nil {
		// Log detailed error for debugging
		log.Error("UpdateEventDetails failed userID=%d: %v", userID, err)

		// Check for specific error messages
		errMsg := err.Error()
		if errMsg == "event not found" {
			return createMessageResponse(http.StatusNotFound, "Event not found")
		}
		if errMsg == "you are not the owner of this event" {
			return createMessageResponse(http.StatusForbidden, "You are not the owner of this event")
		}
		if errMsg == "event is not editable" {
			return createMessageResponse(http.StatusBadRequest, "Event is not editable in current status")
		}
		// Return detailed error message for debugging
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Error updating event: %v", err))
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Event details updated successfully",
	})
}

// ============================================================
// HandleUpdateEventConfig - POST /api/events/update-config
// Cập nhật cấu hình check-in/out (ADMIN và ORGANIZER)
// ============================================================
func (h *EventHandler) HandleUpdateEventConfig(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"]

	if role != "ADMIN" && role != "ORGANIZER" {
		return createMessageResponse(http.StatusForbidden, "Only Admin or Organizer can update config")
	}

	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "User ID not found in request")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusUnauthorized, fmt.Sprintf("Invalid user ID: %s", userIDStr))
	}

	// Parse request body
	var req models.UpdateEventConfigRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate
	if req.CheckinAllowedBeforeStartMinutes < 0 || req.CheckinAllowedBeforeStartMinutes > 600 {
		return createMessageResponse(http.StatusBadRequest, "checkinAllowedBeforeStartMinutes must be between 0 and 600")
	}
	if req.MinMinutesAfterStart < 0 || req.MinMinutesAfterStart > 600 {
		return createMessageResponse(http.StatusBadRequest, "minMinutesAfterStart must be between 0 and 600")
	}

	// EventID = -1: Update global config (ADMIN only)
	// EventID > 0: Update per-event config (ADMIN or ORGANIZER with ownership check)
	if req.EventID == -1 {
		if role != "ADMIN" {
			return createMessageResponse(http.StatusForbidden, "Only Admin can update global config")
		}
	}

	// Update config
	err = h.useCase.UpdateEventConfig(ctx, userID, role, &req)
	if err != nil {
		log.Error("UpdateEventConfig failed userID=%d: %v", userID, err)
		errMsg := err.Error()
		if errMsg == "event not found" {
			return createMessageResponse(http.StatusNotFound, "Event not found")
		}
		if errMsg == "you are not the owner of this event" {
			return createMessageResponse(http.StatusForbidden, "You are not the owner of this event")
		}
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Error updating config: %v", err))
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Config updated successfully",
	})
}

// ============================================================
// HandleGetEventConfig - GET /api/events/config
// Lấy cấu hình check-in/out hiện tại
// Query param: eventId (optional)
//   - Không có eventId hoặc eventId = -1 → global config
//   - eventId > 0 → per-event config (fallback global nếu chưa cấu hình)
//
// ============================================================
func (h *EventHandler) HandleGetEventConfig(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Lấy eventId từ query param (optional)
	eventIDStr := request.QueryStringParameters["eventId"]

	// Nếu không có eventId → trả global config (legacy behavior)
	if eventIDStr == "" {
		config := h.useCase.GetEventConfig(ctx)
		response := models.SystemConfigResponse{
			CheckinAllowedBeforeStartMinutes: config.CheckinAllowedBeforeStartMinutes,
			MinMinutesAfterStart:             config.MinMinutesAfterStart,
		}
		return createJSONResponse(http.StatusOK, response)
	}

	// Parse eventId
	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid eventId parameter")
	}

	// Lấy config theo eventId (-1 = global, >0 = per-event)
	configResp, err := h.useCase.GetEventConfigById(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading event config")
	}

	return createJSONResponse(http.StatusOK, configResp)
}

// ============================================================
// HandleDisableEvent - POST /api/events/disable
// Disable event (ADMIN only)
// KHỚP VỚI Java EventDisableController
// ============================================================
// ============================================================
// HandleGetEventStats - GET /api/events/stats
// Thống kê sự kiện (All authenticated users, with access control)
// Access Control:
//   - ADMIN: Xem tất cả events
//   - ORGANIZER/STAFF: Chỉ xem được event mình tạo (hoặc chỉ STAFF xem được)
//   - USER: Không được phép xem
//
// KHỚP VỚI Java EventStatsController
// ============================================================
func (h *EventHandler) HandleGetEventStats(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get authentication info
	userIDStr := request.Headers["X-User-Id"]
	role := request.Headers["X-User-Role"]

	if userIDStr == "" || role == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: Missing authentication")
	}

	userID, _ := strconv.Atoi(userIDStr)

	// Get event ID from query parameter
	eventIDStr := request.QueryStringParameters["eventId"]
	if eventIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Event ID is required")
	}
	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid event ID")
	}

	// ✅ SPECIAL CASE: eventID = 0 = "All Events" aggregation mode
	if eventID == 0 {
		log.Info("GetEventStats - aggregate mode UserID=%d Role=%s", userID, role)

		// Get aggregate stats
		stats, err := h.useCase.GetAggregateEventStats(ctx, role, userID)
		if err != nil {
			log.Error("GetAggregateEventStats failed: %v", err)
			return createMessageResponse(http.StatusInternalServerError, "Error loading aggregate stats")
		}

		if stats == nil {
			// Return empty stats for no data
			emptyStats := &models.EventStatsResponse{
				EventID:         0,
				EventTitle:      stringPtr("Tất cả sự kiện"),
				TotalTickets:    0,
				CheckedInCount:  0,
				CheckedOutCount: 0,
				BookedCount:     0,
				CancelledCount:  0,
				TotalRevenue:    0,
			}
			return createJSONResponse(http.StatusOK, emptyStats)
		}

		log.Debug("GetEventStats - aggregate response Total=%d CheckedIn=%d Revenue=%.2f",
			stats.TotalTickets, stats.CheckedInCount, stats.TotalRevenue)
		return createJSONResponse(http.StatusOK, stats)
	}

	// ✅ ACCESS CONTROL: Kiểm tra quyền cho single event
	if role != "ADMIN" && role != "STAFF" {
		// ORGANIZER: Chỉ xem được event mình tạo
		if role == "ORGANIZER" {
			// Check if organizer owns this event
			ownsEvent, err := h.useCase.CheckEventOwnership(ctx, eventID, userID)
			if err != nil {
				log.Error("CheckEventOwnership failed eventID=%d: %v", eventID, err)
				return createMessageResponse(http.StatusInternalServerError, "Error checking event ownership")
			}
			if !ownsEvent {
				log.Warn("Forbidden - Organizer %d viewing stats of eventID=%d they don't own", userID, eventID)
				return createMessageResponse(http.StatusForbidden, "You do not have permission to view this event's statistics")
			}
		} else {
			log.Warn("Forbidden - UserID=%d Role=%s viewing event stats", userID, role)
			return createMessageResponse(http.StatusForbidden, "You do not have permission to view event statistics")
		}
	}

	log.Debug("GetEventStats - UserID=%d Role=%s EventID=%d", userID, role, eventID)

	// Get event stats
	stats, err := h.useCase.GetEventStats(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading event stats")
	}

	if stats == nil {
		return createMessageResponse(http.StatusNotFound, "Event not found")
	}

	// ✅ LOG RESPONSE before sending to client
	log.Debug("GetEventStats - EventID=%d Total=%d CheckedIn=%d CheckedOut=%d Booked=%d Cancelled=%d",
		stats.EventID, stats.TotalTickets, stats.CheckedInCount, stats.CheckedOutCount, stats.BookedCount, stats.CancelledCount,
	)

	return createJSONResponse(http.StatusOK, stats)
}

// ============================================================
// HandleGetAvailableAreas - GET /api/events/available-areas?startTime=...&endTime=...&expectedCapacity=...
// 💡 YÊU CẦU #4: Lấy danh sách địa điểm trống
// Gợi ý những địa điểm đang thực sự trống trong khung giờ đó
// KHỚP VỚI YÊU CẦU: "Khi Staff chọn địa điểm trong danh sách, hãy gợi ý..."
// ============================================================
func (h *EventHandler) HandleGetAvailableAreas(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get start and end time from query parameters
	startTime := request.QueryStringParameters["startTime"]
	endTime := request.QueryStringParameters["endTime"]
	expectedCapacityStr := request.QueryStringParameters["expectedCapacity"]

	if startTime == "" || endTime == "" {
		return createMessageResponse(http.StatusBadRequest, "startTime and endTime parameters are required")
	}

	// Parse expectedCapacity (default to 0 if not provided)
	expectedCapacity := 0
	if expectedCapacityStr != "" {
		if cap, err := strconv.Atoi(expectedCapacityStr); err == nil && cap > 0 {
			expectedCapacity = cap
		}
	}

	log.Debug("GetAvailableAreas - startTime=%s endTime=%s expectedCapacity=%d", startTime, endTime, expectedCapacity)

	// Get available areas
	areas, err := h.useCase.GetAvailableAreas(ctx, startTime, endTime, expectedCapacity)
	if err != nil {
		log.Error("GetAvailableAreas failed: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Error loading available areas")
	}

	if areas == nil {
		areas = []models.AvailableAreaInfo{}
	}

	log.Debug("GetAvailableAreas - found %d areas", len(areas))
	return createJSONResponse(http.StatusOK, map[string]interface{}{
		"availableAreas": areas,
		"count":          len(areas),
	})
}

// ============================================================
// HandleCancelEvent - POST /api/organizer/events/cancel
// Organizer hủy sự kiện hoặc yêu cầu của mình
// Scenario 1: Hủy yêu cầu PENDING/UPDATING -> requestId + auto-refund (nếu có)
// Scenario 2: Hủy sự kiện APPROVED -> eventId + auto-refund + release area
// ============================================================
func (h *EventHandler) HandleCancelEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get userID from header
	userIDStr := request.Headers["X-User-Id"]
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Missing X-User-Id header")
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid X-User-Id")
	}

	// Parse request body
	var req models.CancelEventRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}

	// Validate: phải có ít nhất một ID (eventId hoặc requestId)
	if req.EventID <= 0 && req.RequestID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "eventId hoặc requestId là bắt buộc")
	}

	// Scenario 1: Hủy yêu cầu (PENDING/UPDATING)
	if req.RequestID > 0 {
		log.Info("CancelEvent - UserID=%d cancelling RequestID=%d", userID, req.RequestID)
		err = h.useCase.CancelEventRequest(ctx, userID, req.RequestID)
		if err != nil {
			log.Error("CancelEventRequest failed RequestID=%d: %v", req.RequestID, err)
			return createMessageResponse(http.StatusBadRequest, err.Error())
		}
		return createMessageResponse(http.StatusOK, "Yêu cầu đã được rút lại thành công")
	}

	// Scenario 2: Hủy sự kiện (APPROVED)
	log.Info("CancelEvent - UserID=%d cancelling EventID=%d", userID, req.EventID)
	err = h.useCase.CancelEvent(ctx, userID, req.EventID)
	if err != nil {
		log.Error("CancelEvent failed EventID=%d: %v", req.EventID, err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	return createMessageResponse(http.StatusOK, "Sự kiện đã được hủy thành công")
}

// ============================================================
// HandleCheckDailyQuota - GET /api/events/daily-quota?date=YYYY-MM-DD
// Kiểm tra hạn ngạch sự kiện hàng ngày (tối đa 2 sự kiện/ngày)
// ============================================================
func (h *EventHandler) HandleCheckDailyQuota(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get date from query parameter
	eventDate := request.QueryStringParameters["date"]
	if eventDate == "" {
		return createMessageResponse(http.StatusBadRequest, "date parameter is required (format: YYYY-MM-DD)")
	}

	log.Debug("CheckDailyQuota - date=%s", eventDate)

	// Call useCase to check daily quota
	quotaResponse, err := h.useCase.CheckDailyQuota(ctx, eventDate)
	if err != nil {
		log.Error("CheckDailyQuota failed date=%s: %v", eventDate, err)
		return createMessageResponse(http.StatusInternalServerError, "Error checking daily quota")
	}

	return createJSONResponse(http.StatusOK, quotaResponse)
}

// ============================================================
// HandleDisableEvent - POST /api/events/disable
// Chỉ STAFF/ADMIN: đặt event → CANCELLED + kick hoàn tiền 100%
// ============================================================
func (h *EventHandler) HandleDisableEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"]

	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: missing X-User-Id")
	}

	// Chỉ STAFF và ADMIN được phép
	if role != "STAFF" && role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Chỉ STAFF/ADMIN mới có quyền hủy sự kiện")
	}

	var req struct {
		EventID int    `json:"eventId"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request body")
	}
	if req.EventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "eventId là bắt buộc")
	}

	log.Info("DisableEvent - EventID=%d UserID=%s Role=%s", req.EventID, userIDStr, role)

	// BƯỚC 1: Cập nhật trạng thái sự kiện → CANCELLED
	if err := h.useCase.DisableEventByStaff(ctx, req.EventID); err != nil {
		log.Error("DisableEvent - cannot cancel event %d: %v", req.EventID, err)
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}

	log.Info("DisableEvent - EventID=%d set to CANCELLED", req.EventID)

	// BƯỚC 2: Kích hoạt hoàn tiền 100% qua Ticket Service
	log.Info("DisableEvent - Triggering mass refund for EventID=%d", req.EventID)
	client := utils.NewInternalClient()
	refundPayload := map[string]interface{}{
		"eventId": req.EventID,
		"reason":  req.Reason,
	}

	refundURL := utils.GetTicketServiceURL() + "/internal/tickets/refund-all-by-event"
	_, sc, err := client.Post(ctx, refundURL, refundPayload)
	if err != nil || sc >= 400 {
		log.Warn("DisableEvent - refund call failed EventID=%d sc=%d: %v", req.EventID, sc, err)
		// Sự kiện đã CANCELLED — hoàn tiền thất bại nhưng không rollback hủy event
		return createMessageResponse(http.StatusOK,
			fmt.Sprintf("Sự kiện đã hủy nhưng hoàn tiền thất bại (sc=%d). Liên hệ Admin để xử lý thủ công.", sc))
	}

	log.Info("DisableEvent - refund triggered successfully for EventID=%d", req.EventID)
	return createMessageResponse(http.StatusOK, "Sự kiện đã bị hủy và đang tiến hành hoàn tiền 100% cho toàn bộ sinh viên đã mua vé")
}

// ============================================================
// HandleGetEventsByStatusV1 handles GET /api/v1/events (NEW ENDPOINT)
// Unified filtering endpoint with pagination support
//
// Query Parameters:
// - status: 'today' | 'upcoming' | 'past' (required)
// - search: search query string (optional)
// - page: page number (default: 1)
// - limit: items per page (default: 10, max: 100)
//
// Headers:
// - X-User-Role: User role for permission filtering (ADMIN, ORGANIZER, PUBLIC)
// - X-User-Id: User ID for organizer filtering
//
// Response Format:
// {
//   "data": [...EventListItem...],
//   "total": 100,
//   "page": 1,
//   "limit": 8,
//   "totalPages": 13
// }
//
// Status Logic:
// - 'today': OPEN events with start_time on today's date
// - 'upcoming': OPEN events with start_time in the future
// - 'past': CLOSED events OR OPEN events with start_time in the past
//
// Search Logic (OPTIONAL):
// - Searches in: e.title, va.area_name, v.venue_name
// - Uses LIKE with % wildcards
//
// Permission Logic:
// - ADMIN: See all matching events
// - ORGANIZER: See only events created by this user + all public events
// - PUBLIC/GUEST: See all public events (no filtering)
// ============================================================
func (h *EventHandler) HandleGetEventsByStatusV1(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Log entry point
	log.Info("[EVENT-HANDLER] 🚀 HandleGetEventsByStatusV1 called - Processing GET /api/v1/events request")

	// Extract user info from headers
	role := request.Headers["X-User-Role"]
	userIDStr := request.Headers["X-User-Id"]
	userID := 0

	if userIDStr != "" {
		if uid, err := strconv.Atoi(userIDStr); err == nil {
			userID = uid
		} else {
			log.Warn("HandleGetEventsByStatusV1 - Invalid X-User-Id: %s", userIDStr)
		}
	}

	// Default to PUBLIC if role is empty
	if role == "" {
		role = "PUBLIC"
	}

	// Extract and validate query parameters
	statusParam := strings.ToLower(strings.TrimSpace(request.QueryStringParameters["status"]))
	searchParam := strings.TrimSpace(request.QueryStringParameters["search"])
	pageStr := request.QueryStringParameters["page"]
	limitStr := request.QueryStringParameters["limit"]

	// Validate status parameter
	if statusParam == "" {
		statusParam = "open" // Default to open events
	}

	if statusParam != "today" && statusParam != "upcoming" && statusParam != "past" && statusParam != "open" && statusParam != "closed" {
		return createMessageResponse(http.StatusBadRequest, "Invalid status. Use 'today', 'upcoming', or 'past'")
	}

	// Parse pagination parameters
	page := 1
	limit := 10

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	log.Debug("HandleGetEventsByStatusV1 - Status=%s Search='%s' Page=%d Limit=%d Role=%s UserID=%d",
		statusParam, searchParam, page, limit, role, userID)

	// Call usecase with role-based filtering
	var result *repository.EventListV1Result
	var err error

	if role == "ORGANIZER" {
		// Organizer: filter by created_by
		result, err = h.useCase.GetEventsByStatusV1WithRole(ctx, statusParam, searchParam, page, limit, role, userID)
	} else {
		// Admin/Public: no additional filtering
		result, err = h.useCase.GetEventsByStatusV1(ctx, statusParam, searchParam, page, limit)
	}

	if err != nil {
		log.Error("HandleGetEventsByStatusV1 - GetEventsByStatusV1 error: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Failed to fetch events")
	}

	// Ensure data is not null (return empty array instead)
	if result == nil || result.Data == nil {
		result = &repository.EventListV1Result{
			Data:       []models.EventListItem{},
			Total:      0,
			Page:       page,
			Limit:      limit,
			TotalPages: 0,
		}
	}

	// Log access
	log.Info("HandleGetEventsByStatusV1 - Retrieved %d events (total: %d, page: %d/%d) for Role=%s User=%d",
		len(result.Data), result.Total, page, result.TotalPages, role, userID)

	// Return response with empty array if no data (not null)
	if len(result.Data) == 0 {
		result.Data = []models.EventListItem{}
	}

	return createJSONResponse(http.StatusOK, result)
}

// ============================================================
// Helper function: stringPtr converts string to *string
// ============================================================
func stringPtr(s string) *string {
	return &s
}
