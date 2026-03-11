package handler

import (
	"context"
	"database/sql"
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

// NewReportHandlerWithDB creates a new report handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewReportHandlerWithDB(dbConn *sql.DB) *ReportHandler {
	return &ReportHandler{
		useCase: usecase.NewReportUseCaseWithDB(dbConn),
	}
}

// ============================================================
// HandleGetReportDetail - GET /api/staff/reports/detail
// Lấy chi tiết report cho staff (legacy - query params)
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
// HandleGetReportDetailByPath - GET /api/staff/reports/{reportId}
// Lấy chi tiết report cho staff (path parameter)
// Path params: reportId
// ============================================================
func (h *ReportHandler) HandleGetReportDetailByPath(ctx context.Context, request events.APIGatewayProxyRequest, reportID int) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// Check role (STAFF, ADMIN)
	role := request.Headers["X-User-Role"]
	if role != "STAFF" && role != "ADMIN" {
		return createErrorResponse(http.StatusForbidden, "Chỉ Staff/Admin mới được xem chi tiết report")
	}

	if reportID <= 0 {
		return createErrorResponse(http.StatusBadRequest, "reportId không hợp lệ")
	}

	// Get report detail
	dto, err := h.useCase.GetReportDetail(ctx, reportID)
	if err != nil {
		log.Info("Failed to get report detail", "reportID", reportID, "error", err)
		return createErrorResponse(http.StatusNotFound, "Không tìm thấy report")
	}

	// DEBUG: Log the full DTO to trace data flow
	log.Info("🔍 Report Detail DTO Result",
		"reportID", dto.ReportID,
		"ticketID", dto.TicketID,
		"price", dto.Price,
		"seatCode", dto.SeatCode,
		"rowNo", dto.RowNo,
		"colNo", dto.ColNo,
		"areaName", dto.AreaName,
		"floor", dto.Floor,
		"venueName", dto.VenueName,
		"location", dto.Location,
		"categoryTicketName", dto.CategoryTicketName,
		"studentName", dto.StudentName,
		"reportStatus", dto.ReportStatus,
	)

	return createJSONResponse(http.StatusOK, dto)
}

// ============================================================
// HandleListReports - GET /api/staff/reports
// List reports với pagination, filter & search
// Query params:
//   - status (optional): PENDING, APPROVED, REJECTED
//   - page (default=1)
//   - pageSize (default=10)
//   - search (optional): tìm theo tên người gửi hoặc ticket ID
//
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
	search := request.QueryStringParameters["search"]

	page := 1
	pageSize := 10

	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
			pageSize = ps
		}
	}

	// List reports with search support
	result, err := h.useCase.ListReportsWithMetadata(ctx, status, search, page, pageSize)
	if err != nil {
		log.Info("Failed to list reports", "status", status, "search", search, "page", page, "error", err)
		return createErrorResponse(http.StatusBadRequest, err.Error())
	}

	return createJSONResponse(http.StatusOK, result)
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

// ============================================================
// HandleApproveReport - POST /api/staff/reports/approve
// Duyệt report và hoàn tiền
//
// Request Body:
//
//	{
//	  "reportId": 123,
//	  "staffNote": "optional note"
//	}
//
// ============================================================
func (h *ReportHandler) HandleApproveReport(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// Check role (STAFF, ADMIN)
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

	// Parse request body
	var body struct {
		ReportID  int     `json:"reportId"`
		StaffNote *string `json:"staffNote"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Request body không hợp lệ")
	}

	req := &models.ProcessReportRequest{
		ReportID:  body.ReportID,
		Action:    "APPROVE",
		StaffNote: body.StaffNote,
	}

	resp, err := h.useCase.ProcessReport(ctx, req, staffID)
	if err != nil {
		log.Info("Failed to approve report", "reportID", body.ReportID, "error", err)
		return createErrorResponse(http.StatusInternalServerError, err.Error())
	}

	statusCode := http.StatusOK
	if resp.Status == "fail" {
		statusCode = http.StatusBadRequest
	}

	return createJSONResponse(statusCode, resp)
}

// ============================================================
// HandleRejectReport - POST /api/staff/reports/reject
// Từ chối report
//
// Request Body:
//
//	{
//	  "reportId": 123,
//	  "staffNote": "optional note"
//	}
//
// ============================================================
func (h *ReportHandler) HandleRejectReport(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := logger.Default().WithContext(ctx)

	// Check role (STAFF, ADMIN)
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

	// Parse request body
	var body struct {
		ReportID  int     `json:"reportId"`
		StaffNote *string `json:"staffNote"`
	}
	if err := json.Unmarshal([]byte(request.Body), &body); err != nil {
		return createErrorResponse(http.StatusBadRequest, "Request body không hợp lệ")
	}

	req := &models.ProcessReportRequest{
		ReportID:  body.ReportID,
		Action:    "REJECT",
		StaffNote: body.StaffNote,
	}

	resp, err := h.useCase.ProcessReport(ctx, req, staffID)
	if err != nil {
		log.Info("Failed to reject report", "reportID", body.ReportID, "error", err)
		return createErrorResponse(http.StatusInternalServerError, err.Error())
	}

	statusCode := http.StatusOK
	if resp.Status == "fail" {
		statusCode = http.StatusBadRequest
	}

	return createJSONResponse(statusCode, resp)
}
