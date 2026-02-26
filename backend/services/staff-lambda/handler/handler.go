package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/staff-lambda/models"
	"github.com/fpt-event-services/services/staff-lambda/usecase"
)

// StaffHandler handles staff-related requests
type StaffHandler struct {
	useCase *usecase.StaffUseCase
}

// NewStaffHandler creates a new staff handler
func NewStaffHandler() *StaffHandler {
	return &StaffHandler{
		useCase: usecase.NewStaffUseCase(),
	}
}

// ============================================================
// HandleCheckin - POST /api/staff/checkin
// Check-in vé bằng QR code
// KHỚP VỚI Java StaffCheckinController
// ✅ CHỈ CHO PHÉP ORGANIZER (không phải STAFF hay ADMIN)
// ============================================================
func (h *StaffHandler) HandleCheckin(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// ✅ CHỈ CHO PHÉP ORGANIZER
	role := request.Headers["X-User-Role"]
	if role != "ORGANIZER" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Organizer mới có quyền quét mã QR check-in")
	}

	// Lấy userID để kiểm tra ownership
	userIDStr := request.Headers["X-User-Id"]
	userID := 0
	if userIDStr != "" {
		fmt.Sscanf(userIDStr, "%d", &userID)
	}
	if userID == 0 {
		return createErrorResponse(http.StatusUnauthorized, "Không xác định được người dùng")
	}

	// Get ticket code from query params
	ticketCode := request.QueryStringParameters["ticketCode"]
	if ticketCode == "" {
		ticketCode = request.QueryStringParameters["ticketId"]
	}

	if ticketCode == "" {
		return createErrorResponse(http.StatusBadRequest, "Không tìm thấy mã vé. Vui lòng quét lại mã QR")
	}

	// Process check-in với userID để verify ownership
	result, err := h.useCase.CheckIn(ctx, userID, ticketCode)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi xử lý check-in")
	}

	statusCode := http.StatusOK
	if !result.Success {
		statusCode = http.StatusBadRequest
	}

	return createJSONResponse(statusCode, result)
}

// ============================================================
// HandleCheckout - POST /api/staff/checkout
// Check-out vé bằng QR code
// KHỚP VỚI Java StaffCheckoutController
// ✅ CHỈ CHO PHÉP ORGANIZER (không phải STAFF hay ADMIN)
// ============================================================
func (h *StaffHandler) HandleCheckout(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// ✅ CHỈ CHO PHÉP ORGANIZER
	role := request.Headers["X-User-Role"]
	if role != "ORGANIZER" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Organizer mới có quyền quét mã QR check-out")
	}

	// Lấy userID để kiểm tra ownership
	userIDStr := request.Headers["X-User-Id"]
	userID := 0
	if userIDStr != "" {
		fmt.Sscanf(userIDStr, "%d", &userID)
	}
	if userID == 0 {
		return createErrorResponse(http.StatusUnauthorized, "Không xác định được người dùng")
	}

	// Get ticket code from query params
	ticketCode := request.QueryStringParameters["ticketCode"]
	if ticketCode == "" {
		ticketCode = request.QueryStringParameters["ticketId"]
	}

	if ticketCode == "" {
		return createErrorResponse(http.StatusBadRequest, "Không tìm thấy mã vé. Vui lòng quét lại mã QR")
	}

	// Process check-out với userID để verify ownership
	result, err := h.useCase.CheckOut(ctx, userID, ticketCode)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi xử lý check-out")
	}

	statusCode := http.StatusOK
	if !result.Success {
		statusCode = http.StatusBadRequest
	}

	return createJSONResponse(statusCode, result)
}

// createJSONResponse creates a JSON response
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
			Body: `{"error":"Failed to serialize response"}`,
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

// createErrorResponse creates an error response
func createErrorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"error": message,
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
// HandleGetReports - GET /api/staff/reports
// Lấy danh sách report cho staff
// KHỚP VỚI Java ReportStaffController.listReports()
// ============================================================
func (h *StaffHandler) HandleGetReports(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN, STAFF)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" && role != "STAFF" {
		return createErrorResponse(http.StatusForbidden, "Bạn không có quyền truy cập")
	}

	// Get reports
	reports, err := h.useCase.GetReports(ctx)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi khi lấy danh sách báo cáo")
	}

	return createJSONResponse(http.StatusOK, reports)
}

// ============================================================
// HandleGetReportDetail - GET /api/staff/reports/{id}
// Lấy chi tiết report cho staff
// KHỚP VỚI Java ReportStaffController.detailReport()
// ============================================================
func (h *StaffHandler) HandleGetReportDetail(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN, STAFF)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" && role != "STAFF" {
		return createErrorResponse(http.StatusForbidden, "Bạn không có quyền truy cập")
	}

	// Get report ID from path
	reportIDStr := request.PathParameters["id"]
	if reportIDStr == "" {
		return createErrorResponse(http.StatusBadRequest, "Thiếu ID báo cáo")
	}

	reportID, err := json.Number(reportIDStr).Int64()
	if err != nil {
		return createErrorResponse(http.StatusBadRequest, "ID báo cáo không hợp lệ")
	}

	// Get report detail
	report, err := h.useCase.GetReportDetail(ctx, int(reportID))
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi khi lấy chi tiết báo cáo")
	}

	if report == nil {
		return createErrorResponse(http.StatusNotFound, "Không tìm thấy báo cáo")
	}

	return createJSONResponse(http.StatusOK, report)
}

// ============================================================
// HandleGetSystemConfig - GET /api/admin/config/system
// Lấy cấu hình hệ thống (ADMIN only)
// KHỚP VỚI Frontend SystemConfig.tsx
// ============================================================
func (h *StaffHandler) HandleGetSystemConfig(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN only)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ ADMIN mới có quyền truy cập")
	}

	// Get system config
	config, err := h.useCase.GetSystemConfig(ctx)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi khi lấy cấu hình hệ thống")
	}

	response := map[string]interface{}{
		"success": true,
		"data":    config,
	}

	return createJSONResponse(http.StatusOK, response)
}

// ============================================================
// HandleUpdateSystemConfig - POST /api/admin/config/system
// Cập nhật cấu hình hệ thống (ADMIN only)
// KHỚP VỚI Frontend SystemConfig.tsx
// ============================================================
func (h *StaffHandler) HandleUpdateSystemConfig(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Check role (ADMIN only)
	role := request.Headers["X-User-Role"]
	if role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ ADMIN mới có quyền cập nhật cấu hình")
	}

	// Parse request body
	var reqData models.SystemConfigData

	if err := json.Unmarshal([]byte(request.Body), &reqData); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Dữ liệu không hợp lệ")
	}

	// Validate
	if reqData.MinMinutesAfterStart < 0 || reqData.MinMinutesAfterStart > 600 {
		return createErrorResponse(http.StatusBadRequest, "Thời gian check-out phải từ 0 đến 600 phút")
	}
	if reqData.CheckinAllowedBeforeStartMinutes < 0 || reqData.CheckinAllowedBeforeStartMinutes > 600 {
		return createErrorResponse(http.StatusBadRequest, "Thời gian check-in phải từ 0 đến 600 phút")
	}

	// Update config
	err := h.useCase.UpdateSystemConfig(ctx, reqData)
	if err != nil {
		return createErrorResponse(http.StatusInternalServerError, "Lỗi khi cập nhật cấu hình")
	}

	response := map[string]interface{}{
		"success": true,
		"message": "Cập nhật cấu hình thành công",
		"data":    reqData,
	}

	return createJSONResponse(http.StatusOK, response)
}
