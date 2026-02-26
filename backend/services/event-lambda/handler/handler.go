package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/event-lambda/models"
	"github.com/fpt-event-services/services/event-lambda/usecase"
)

// EventHandler handles event-related requests
type EventHandler struct {
	useCase *usecase.EventUseCase
}

// NewEventHandler creates a new event handler
func NewEventHandler() *EventHandler {
	return &EventHandler{
		useCase: usecase.NewEventUseCase(),
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
			fmt.Printf("[PERMISSION] Invalid X-User-Id: %s\n", userIDStr)
		}
	}

	// Default to public access if role is empty (guest/not logged in)
	if role == "" {
		role = "PUBLIC"
	}

	fmt.Printf("[PERMISSION] HandleGetEvents - Role=%s, UserID=%d\n", role, userID)

	// Get all events separated by status (khớp với Java)
	// Pass role and userID for permission filtering
	openEvents, closedEvents, err := h.useCase.GetAllEventsSeparated(ctx, role, userID)
	if err != nil {
		// ✅ Log chi tiết lỗi để debug
		fmt.Printf("❌ ERROR GetAllEventsSeparated: %v\n", err)
		return createMessageResponse(http.StatusInternalServerError, fmt.Sprintf("Internal server error when loading events: %v", err))
	}

	// Return empty arrays if nil
	if openEvents == nil {
		openEvents = []models.EventListItem{}
	}
	if closedEvents == nil {
		closedEvents = []models.EventListItem{}
	}

	// ✅ SECURITY LOG: Track filtered events access
	totalEvents := len(openEvents) + len(closedEvents)
	fmt.Printf("[SECURITY] Filtered events for UserID: %d, Role: %s, Total Events Returned: %d (OPEN: %d, CLOSED: %d)\n",
		userID, role, totalEvents, len(openEvents), len(closedEvents))
	fmt.Printf("[PERMISSION] Returning %d OPEN events, %d CLOSED events\n", len(openEvents), len(closedEvents))

	// Response format khớp với Java Backend
	response := map[string]interface{}{
		"openEvents":   openEvents,
		"closedEvents": closedEvents,
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
	log.Printf("[HandleCreateEventRequest] Parsing times - Start: %s, End: %s", req.PreferredStartTime, req.PreferredEndTime)
	startTime, err := ParseEventTime(req.PreferredStartTime)
	if err != nil {
		log.Printf("[HandleCreateEventRequest] Failed to parse start time: %v", err)
		return createMessageResponse(http.StatusBadRequest, "Invalid start time format")
	}
	endTime, err := ParseEventTime(req.PreferredEndTime)
	if err != nil {
		log.Printf("[HandleCreateEventRequest] Failed to parse end time: %v", err)
		return createMessageResponse(http.StatusBadRequest, "Invalid end time format")
	}
	log.Printf("[HandleCreateEventRequest] Parsed times - Start: %s, End: %s", startTime.Format("2006-01-02 15:04:05"), endTime.Format("2006-01-02 15:04:05"))

	// Validate event time rules
	log.Printf("[HandleCreateEventRequest] Validating event time rules...")
	if err := ValidateEventTime(startTime, endTime); err != nil {
		log.Printf("[HandleCreateEventRequest] Time validation failed: %v", err.Error())
		return createMessageResponse(http.StatusBadRequest, err.Error())
	}
	log.Printf("[HandleCreateEventRequest] Time validation passed")

	// Create event request
	requestID, err := h.useCase.CreateEventRequest(ctx, userID, &req)
	if err != nil {
		log.Printf("[HandleCreateEventRequest] Failed to create event request: %v", err)
		return createMessageResponse(http.StatusInternalServerError, "Error creating event request")
	}

	log.Printf("[HandleCreateEventRequest] Successfully created request ID: %d", requestID)
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
	// Get request ID from path parameters
	requestIDStr := request.PathParameters["id"]
	if requestIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Event request ID is required")
	}

	requestID, err := strconv.Atoi(requestIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid request ID format")
	}

	// Get event request detail with venue info
	eventRequest, err := h.useCase.GetEventRequestByID(ctx, requestID)
	if err != nil {
		fmt.Printf("[ERROR] GetEventRequestByID failed: %v\n", err)
		return createMessageResponse(http.StatusInternalServerError, "Error fetching event request")
	}

	if eventRequest == nil {
		return createMessageResponse(http.StatusNotFound, "Event request not found")
	}

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
	fmt.Printf("[ProcessEventRequest] RequestID=%d, Action=%s, AreaID=%v, SpeakerID=%v\n",
		req.RequestID, req.Action, req.AreaID, req.SpeakerID)

	// Process event request
	err := h.useCase.ProcessEventRequest(ctx, userID, &req)
	if err != nil {
		fmt.Printf("[ERROR] ProcessEventRequest failed: %v\n", err)
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
	fmt.Printf("[UpdateEventRequest] RequestID=%d, UserID=%d, Status=%s\n", req.RequestID, userID, req.Status)

	// ===== BUSINESS LOGIC GUARDS - Check if event can be updated =====
	// Get the related event to check status and start time
	eventEligible, eligibilityError := h.useCase.CheckEventUpdateEligibility(ctx, req.RequestID)
	if eligibilityError != nil {
		fmt.Printf("[ERROR] CheckEventUpdateEligibility failed: %v\n", eligibilityError)

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
			fmt.Printf("[ERROR] GetEventRequestByID failed: %v\n", err)
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
		fmt.Printf("[ERROR] UpdateEventRequest failed: %v\n", err)
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
		fmt.Printf("[ERROR] UpdateEventDetails failed: %v\n", err)

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
		fmt.Printf("[ERROR] UpdateEventConfig failed: %v\n", err)
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
func (h *EventHandler) HandleDisableEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN only)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createMessageResponse(http.StatusForbidden, "Admin access required")
	}

	// Get event ID from query parameter
	eventIDStr := request.QueryStringParameters["id"]
	if eventIDStr == "" {
		return createMessageResponse(http.StatusBadRequest, "Event ID is required")
	}
	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createMessageResponse(http.StatusBadRequest, "Invalid event ID")
	}

	// Disable event
	err = h.useCase.DisableEvent(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error disabling event")
	}

	return createJSONResponse(http.StatusOK, map[string]string{
		"message": "Event disabled successfully",
	})
}

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
		fmt.Printf("[STATS_ALL] Calculating aggregate stats for UserID: %d, Role: %s\n", userID, role)

		// Get aggregate stats
		stats, err := h.useCase.GetAggregateEventStats(ctx, role, userID)
		if err != nil {
			fmt.Printf("[ERROR] GetAggregateEventStats failed: %v\n", err)
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

		fmt.Printf("[STATS API] Sending aggregate response: Total=%d, CheckedIn=%d, CheckedOut=%d, Revenue=%.2f\n",
			stats.TotalTickets, stats.CheckedInCount, stats.CheckedOutCount, stats.TotalRevenue)
		return createJSONResponse(http.StatusOK, stats)
	}

	// ✅ ACCESS CONTROL: Kiểm tra quyền cho single event
	if role != "ADMIN" && role != "STAFF" {
		// ORGANIZER: Chỉ xem được event mình tạo
		// Khác ADMIN/STAFF/ORGANIZER: Không được phép
		if role == "ORGANIZER" {
			// Check if organizer owns this event
			ownsEvent, err := h.useCase.CheckEventOwnership(ctx, eventID, userID)
			if err != nil {
				fmt.Printf("[ERROR] CheckEventOwnership failed: %v\n", err)
				return createMessageResponse(http.StatusInternalServerError, "Error checking event ownership")
			}
			if !ownsEvent {
				fmt.Printf("[FORBIDDEN] Organizer %d trying to view stats of event %d they don't own\n", userID, eventID)
				return createMessageResponse(http.StatusForbidden, "You do not have permission to view this event's statistics")
			}
		} else {
			// CUSTOMER/OTHER roles not allowed
			fmt.Printf("[FORBIDDEN] User %d with role %s trying to view event stats\n", userID, role)
			return createMessageResponse(http.StatusForbidden, "You do not have permission to view event statistics")
		}
	}

	fmt.Printf("[STATS ACCESS] UserID=%d (Role=%s) requesting stats for EventID=%d\n", userID, role, eventID)

	// Get event stats
	stats, err := h.useCase.GetEventStats(ctx, eventID)
	if err != nil {
		return createMessageResponse(http.StatusInternalServerError, "Error loading event stats")
	}

	if stats == nil {
		return createMessageResponse(http.StatusNotFound, "Event not found")
	}

	// ✅ LOG RESPONSE before sending to client
	fmt.Printf("[STATS API] Sending response to client: EventID=%d, Total=%d, CheckedIn=%d, CheckedOut=%d, Booked=%d, Cancelled=%d\n",
		stats.EventID,
		stats.TotalTickets,
		stats.CheckedInCount,
		stats.CheckedOutCount,
		stats.BookedCount,
		stats.CancelledCount,
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

	fmt.Printf("[AVAILABLE AREAS] Query: startTime=%s, endTime=%s, expectedCapacity=%d\n", startTime, endTime, expectedCapacity)

	// Get available areas
	areas, err := h.useCase.GetAvailableAreas(ctx, startTime, endTime, expectedCapacity)
	if err != nil {
		fmt.Printf("[ERROR] Failed to get available areas: %v\n", err)
		return createMessageResponse(http.StatusInternalServerError, "Error loading available areas")
	}

	if areas == nil {
		areas = []models.AvailableAreaInfo{}
	}

	fmt.Printf("[AVAILABLE AREAS] Found %d available areas\n", len(areas))
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
		fmt.Printf("[CancelEvent] UserID=%d cancelling RequestID=%d\n", userID, req.RequestID)
		err = h.useCase.CancelEventRequest(ctx, userID, req.RequestID)
		if err != nil {
			fmt.Printf("[ERROR] Failed to cancel request: %v\n", err)
			return createMessageResponse(http.StatusBadRequest, err.Error())
		}
		return createMessageResponse(http.StatusOK, "Yêu cầu đã được rút lại thành công")
	}

	// Scenario 2: Hủy sự kiện (APPROVED)
	fmt.Printf("[CancelEvent] UserID=%d cancelling EventID=%d\n", userID, req.EventID)
	err = h.useCase.CancelEvent(ctx, userID, req.EventID)
	if err != nil {
		fmt.Printf("[ERROR] Failed to cancel event: %v\n", err)
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

	fmt.Printf("[CheckDailyQuota] Checking quota for date: %s\n", eventDate)

	// Call useCase to check daily quota
	quotaResponse, err := h.useCase.CheckDailyQuota(ctx, eventDate)
	if err != nil {
		fmt.Printf("[ERROR] Failed to check daily quota: %v\n", err)
		return createMessageResponse(http.StatusInternalServerError, "Error checking daily quota")
	}

	return createJSONResponse(http.StatusOK, quotaResponse)
}

// ============================================================
// Helper function: stringPtr converts string to *string
// ============================================================
func stringPtr(s string) *string {
	return &s
}
