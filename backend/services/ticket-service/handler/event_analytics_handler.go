package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/ticket-service/repository"
)

// extractEventIDFromPath trích xuất eventId từ đường dẫn URL
func extractEventIDFromPath(path string) int {
	pathParts := strings.Split(path, "/")
	for i, part := range pathParts {
		if part == "events" && i+1 < len(pathParts) {
			id, _ := strconv.Atoi(pathParts[i+1])
			return id
		}
	}
	return 0
}

// HandleGetEventFinancialOverview - GET /api/v1/organizer/events/{id}/financial-overview
// Báo cáo 3 cột tiền tài chính sự kiện (Pha 5)
func (h *TicketHandler) HandleGetEventFinancialOverview(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return createMessageResponse(http.StatusUnauthorized, "Invalid userId format")
	}

	eventID := extractEventIDFromPath(request.Path)
	if eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID không hợp lệ")
	}

	overview, err := h.useCase.GetEventFinancialOverview(ctx, eventID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return createMessageResponse(http.StatusUnauthorized, "Người dùng không tồn tại")
		}
		if errors.Is(err, repository.ErrEventForbidden) {
			return createMessageResponse(http.StatusForbidden, "Bạn không có quyền truy cập thông tin sự kiện này")
		}
		if errors.Is(err, repository.ErrEventNotFound) {
			return createMessageResponse(http.StatusNotFound, "Sự kiện không tồn tại")
		}
		log.Error("[ANALYTICS_HANDLER_ERROR] HandleGetEventFinancialOverview event %d: %v", eventID, err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải báo cáo tài chính sự kiện")
	}

	return createJSONResponse(http.StatusOK, overview)
}

// HandleGetEventCheckInList - GET /api/v1/organizer/events/{id}/check-in-list
// Danh sách check-in và người tham dự thời gian thực (Pha 5)
func (h *TicketHandler) HandleGetEventCheckInList(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return createMessageResponse(http.StatusUnauthorized, "Invalid userId format")
	}

	eventID := extractEventIDFromPath(request.Path)
	if eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID không hợp lệ")
	}

	checkIns, err := h.useCase.GetEventCheckInList(ctx, eventID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return createMessageResponse(http.StatusUnauthorized, "Người dùng không tồn tại")
		}
		if errors.Is(err, repository.ErrEventForbidden) {
			return createMessageResponse(http.StatusForbidden, "Bạn không có quyền truy cập thông tin sự kiện này")
		}
		if errors.Is(err, repository.ErrEventNotFound) {
			return createMessageResponse(http.StatusNotFound, "Sự kiện không tồn tại")
		}
		log.Error("[ANALYTICS_HANDLER_ERROR] HandleGetEventCheckInList event %d: %v", eventID, err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải danh sách check-in")
	}

	return createJSONResponse(http.StatusOK, checkIns)
}

// HandleGetEventSeatStatus - GET /api/v1/organizer/events/{id}/seat-status
// Trạng thái ghế và số lượng đăng ký thời gian thực (Pha 5)
func (h *TicketHandler) HandleGetEventSeatStatus(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return createMessageResponse(http.StatusUnauthorized, "Invalid userId format")
	}

	eventID := extractEventIDFromPath(request.Path)
	if eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID không hợp lệ")
	}

	seatStatus, err := h.useCase.GetEventSeatStatus(ctx, eventID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return createMessageResponse(http.StatusUnauthorized, "Người dùng không tồn tại")
		}
		if errors.Is(err, repository.ErrEventForbidden) {
			return createMessageResponse(http.StatusForbidden, "Bạn không có quyền truy cập thông tin sự kiện này")
		}
		if errors.Is(err, repository.ErrEventNotFound) {
			return createMessageResponse(http.StatusNotFound, "Sự kiện không tồn tại")
		}
		log.Error("[ANALYTICS_HANDLER_ERROR] HandleGetEventSeatStatus event %d: %v", eventID, err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải trạng thái ghế thời gian thực")
	}

	return createJSONResponse(http.StatusOK, seatStatus)
}

// HandleGetEventAdvancedAnalytics - GET /api/v1/organizer/events/{id}/advanced-analytics
// Báo cáo nâng cao với cơ chế chặn Paywall FAIL-CLOSED (Pha 6)
func (h *TicketHandler) HandleGetEventAdvancedAnalytics(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return createMessageResponse(http.StatusUnauthorized, "Invalid userId format")
	}

	eventID := extractEventIDFromPath(request.Path)
	if eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID không hợp lệ")
	}

	analytics, err := h.useCase.GetEventAdvancedAnalytics(ctx, eventID, userID)
	if err != nil {
		var paywallErr *repository.ErrPaywallRequired
		if errors.As(err, &paywallErr) {
			return createJSONResponse(http.StatusForbidden, map[string]interface{}{
				"error":           "PAYWALL_REQUIRED",
				"message":         paywallErr.Message,
				"currentTier":     paywallErr.CurrentTier,
				"requiresUpgrade": true,
			})
		}
		if errors.Is(err, repository.ErrUserNotFound) {
			return createMessageResponse(http.StatusUnauthorized, "Người dùng không tồn tại")
		}
		if errors.Is(err, repository.ErrEventForbidden) {
			return createMessageResponse(http.StatusForbidden, "Bạn không có quyền truy cập thông tin sự kiện này")
		}
		if errors.Is(err, repository.ErrEventNotFound) {
			return createMessageResponse(http.StatusNotFound, "Sự kiện không tồn tại")
		}
		if errors.Is(err, repository.ErrFailClosed503) {
			return createJSONResponse(http.StatusServiceUnavailable, map[string]interface{}{
				"error":   "FAIL_CLOSED",
				"message": "Không thể xác thực quyền hạn do nguồn dữ liệu gián đoạn (fail-closed)",
			})
		}
		log.Error("[ANALYTICS_HANDLER_ERROR] HandleGetEventAdvancedAnalytics event %d: %v", eventID, err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi tải báo cáo nâng cao")
	}

	return createJSONResponse(http.StatusOK, analytics)
}

// HandleExportEventCSV - GET /api/v1/organizer/events/{id}/export-csv
// Xuất CSV báo cáo dữ liệu của chính sự kiện với phòng chống CSV Injection (Pha 6)
func (h *TicketHandler) HandleExportEventCSV(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userIDStr := extractUserIDFromHeaders(request.Headers)
	if userIDStr == "" {
		return createMessageResponse(http.StatusUnauthorized, "Unauthorized: thiếu thông tin xác thực")
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		return createMessageResponse(http.StatusUnauthorized, "Invalid userId format")
	}

	eventID := extractEventIDFromPath(request.Path)
	if eventID <= 0 {
		return createMessageResponse(http.StatusBadRequest, "Event ID không hợp lệ")
	}

	csvBytes, err := h.useCase.ExportEventCSV(ctx, eventID, userID)
	if err != nil {
		var paywallErr *repository.ErrPaywallRequired
		if errors.As(err, &paywallErr) {
			return createJSONResponse(http.StatusForbidden, map[string]interface{}{
				"error":           "PAYWALL_REQUIRED",
				"message":         paywallErr.Message,
				"currentTier":     paywallErr.CurrentTier,
				"requiresUpgrade": true,
			})
		}
		if errors.Is(err, repository.ErrUserNotFound) {
			return createMessageResponse(http.StatusUnauthorized, "Người dùng không tồn tại")
		}
		if errors.Is(err, repository.ErrEventForbidden) {
			return createMessageResponse(http.StatusForbidden, "Bạn không có quyền truy cập thông tin sự kiện này")
		}
		if errors.Is(err, repository.ErrEventNotFound) {
			return createMessageResponse(http.StatusNotFound, "Sự kiện không tồn tại")
		}
		if errors.Is(err, repository.ErrFailClosed503) {
			return createJSONResponse(http.StatusServiceUnavailable, map[string]interface{}{
				"error":   "FAIL_CLOSED",
				"message": "Không thể xác thực quyền hạn do nguồn dữ liệu gián đoạn (fail-closed)",
			})
		}
		log.Error("[ANALYTICS_HANDLER_ERROR] HandleExportEventCSV event %d: %v", eventID, err)
		return createMessageResponse(http.StatusInternalServerError, "Đã xảy ra lỗi hệ thống khi xuất dữ liệu CSV")
	}

	headers := map[string]string{
		"Content-Type":        "text/csv; charset=utf-8",
		"Content-Disposition": "attachment; filename=\"event_" + strconv.Itoa(eventID) + "_analytics.csv\"",
	}

	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Headers:    headers,
		Body:       string(csvBytes),
	}, nil
}
