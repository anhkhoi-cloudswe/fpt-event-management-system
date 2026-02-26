package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/models"
	"github.com/fpt-event-services/services/staff-lambda/usecase"
)

// ReportHandler handles report/refund-related requests
type ReportHandler struct {
	useCase *usecase.ReportUseCase
}

// NewReportHandler creates a new report handler
func NewReportHandler() *ReportHandler {
	return &ReportHandler{
		useCase: usecase.NewReportUseCase(),
	}
}

// ============================================================
// HandleGetReportDetail - GET /api/staff/reports/detail
// Lấy chi tiết report cho staff
// Query params: reportId
// ============================================================
func (h *ReportHandler) HandleGetReportDetail(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// Check role (STAFF, ADMIN)
	role := request.Headers["X-User-Role"]
	if role != "STAFF" && role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Staff/Admin mới được xem chi tiết report")
	}

	// Get reportId from query params
	reportIDStr := request.QueryStringParameters["reportId"]
	if reportIDStr == "" {
		return createErrorResponse(http.StatusBadRequest, "reportId là bắt buộc")
	}

	reportID, err := strconv.Atoi(reportIDStr)
	if err != nil || reportID <= 0 {
		return createErrorResponse(http.StatusBadRequest, "reportId không hợp lệ")
	}

	// Get report detail
	dto, err := h.useCase.GetReportDetail(ctx, reportID)
	if err != nil {
		log.Info("Failed to get report detail", "reportID", reportID, "error", err)
		return createErrorResponse(http.StatusNotFound, "Không tìm thấy report")
	}

	return createJSONResponse(http.StatusOK, dto)
}

// ============================================================
// HandleListReports - GET /api/staff/reports
// List reports với pagination & filter
// Query params: status (optional), page (default=1), pageSize (default=10)
// ============================================================
func (h *ReportHandler) HandleListReports(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// Check role (STAFF, ADMIN)
	role := request.Headers["X-User-Role"]
	if role != "STAFF" && role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Staff/Admin mới được xem danh sách report")
	}

	// Parse query params
	status := request.QueryStringParameters["status"]
	pageStr := request.QueryStringParameters["page"]
	pageSizeStr := request.QueryStringParameters["pageSize"]

	page := 1
	pageSize := 10

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
			pageSize = ps
		}
	}

	// List reports
	list, err := h.useCase.ListReports(ctx, status, page, pageSize)
	if err != nil {
		log.Info("Failed to list reports", "status", status, "page", page, "error", err)
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	resp := map[string]interface{}{
		"status": "success",
		"data":   list,
		"page":   page,
		"size":   len(list),
	}

	return createJSONResponse(http.StatusOK, resp)
}

// ============================================================
// HandleProcessReport - POST /api/staff/reports/process
// APPROVE/REJECT report (refund logic)
// KHỚP VỚI Java StaffProcessReportController
//
// Request Body:
//
//	{
//	  "reportId": 123,
//	  "action": "APPROVE" | "REJECT",
//	  "staffNote": "optional note"
//	}
//
// Response (APPROVE):
//
//	{
//	  "status": "success",
//	  "message": "Đã duyệt và hoàn tiền thành công",
//	  "refundAmount": 100000
//	}
//
// Response (REJECT):
//
//	{
//	  "status": "success",
//	  "message": "Đã từ chối report"
//	}
//
// ============================================================
func (h *ReportHandler) HandleProcessReport(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// 1) Check role (STAFF, ADMIN)
	role := request.Headers["X-User-Role"]
	if role != "STAFF" && role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Staff/Admin mới được xử lý report")
	}

	// Get staffId from headers
	staffIDStr := request.Headers["X-User-Id"]
	if staffIDStr == "" {
		return createErrorResponse(http.StatusUnauthorized, "Không tìm thấy staffId")
	}

	staffID, err := strconv.Atoi(staffIDStr)
	if err != nil || staffID <= 0 {
		return createErrorResponse(http.StatusUnauthorized, "staffId không hợp lệ")
	}

	// 2) Parse request body
	var req models.ProcessReportRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Request body không hợp lệ")
	}

	// 3) Process report
	resp, err := h.useCase.ProcessReport(ctx, &req, staffID)
	if err != nil {
		log.Info("Failed to process report", "reportID", req.ReportID, "action", req.Action, "error", err)
		return createErrorResponse(http.StatusInternalServerError, err.Error())
	}

	// 4) Return response
	statusCode := http.StatusOK
	if resp.Status == "fail" {
		statusCode = http.StatusBadRequest
	}

	return createJSONResponse(statusCode, resp)
}
