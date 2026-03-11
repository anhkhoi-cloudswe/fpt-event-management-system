package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// StudentReportHandler - Xử lý report từ phía Student
// ⭐ Phase 5: Di chuyển từ main.go inline code vào staff-lambda
//
// Endpoints:
//   POST /api/student/reports            → Submit error report
//   GET  /api/student/reports/pending-ticket-ids → Get pending ticket IDs
// ============================================================

// StudentReportHandler handles student report requests
type StudentReportHandler struct {
	db     *sql.DB
	logger *logger.Logger
}

// NewStudentReportHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewStudentReportHandlerWithDB(dbConn *sql.DB) *StudentReportHandler {
	return &StudentReportHandler{
		db:     dbConn,
		logger: logger.Default(),
	}
}

// ============================================================
// HandleSubmitReport - POST /api/student/reports
// Submit error report for checked-in ticket
// KHỚP VỚI logic cũ trong main.go (giữ nguyên JSON response)
// ============================================================
func (h *StudentReportHandler) HandleSubmitReport(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log := h.logger.WithContext(ctx)

	// 1) Extract userID from headers (set by authMiddleware)
	userIDStr := request.Headers["X-User-Id"]
	userID := 0
	if userIDStr != "" {
		fmt.Sscanf(userIDStr, "%d", &userID)
	}
	if userID <= 0 {
		log.Info("[STUDENT_REPORT] Cannot find userID in headers")
		return createStudentReportResponse(http.StatusUnauthorized,
			map[string]string{"status": "fail", "message": "Unauthorized: missing user ID"})
	}
	log.Info("[STUDENT_REPORT] Retrieved userID=%d from headers", userID)

	// 2) Check role = STUDENT
	userRole := request.Headers["X-User-Role"]
	if userRole != "STUDENT" {
		log.Info("[STUDENT_REPORT] Invalid role: %s", userRole)
		return createStudentReportResponse(http.StatusForbidden,
			map[string]string{"status": "fail", "message": "Only students can submit reports"})
	}

	// 3) Parse request body
	var reportBody struct {
		TicketId    int    `json:"ticketId"`
		Title       string `json:"title"`
		Description string `json:"description"`
		ImageUrl    string `json:"imageUrl"`
	}
	if err := json.Unmarshal([]byte(request.Body), &reportBody); err != nil {
		return createStudentReportResponse(http.StatusBadRequest,
			map[string]string{"status": "fail", "message": "Invalid JSON"})
	}

	log.Info("[STUDENT_REPORT] TicketID: %d | UserID: %d | Title: '%s'",
		reportBody.TicketId, userID, reportBody.Title)

	// 4) Validate input
	if reportBody.TicketId <= 0 {
		return createStudentReportResponse(http.StatusBadRequest,
			map[string]string{"status": "fail", "message": "Invalid ticketId"})
	}
	if strings.TrimSpace(reportBody.Description) == "" {
		return createStudentReportResponse(http.StatusBadRequest,
			map[string]string{"status": "fail", "message": "Description is required"})
	}

	// 5) Get database connection
	dbConn := h.db
	if dbConn == nil {
		return createStudentReportResponse(http.StatusInternalServerError,
			map[string]string{"status": "error", "message": "Database connection failed"})
	}

	// 6) Verify ticket ownership and check status
	var ticketStatus string
	var ticketUserID int
	checkQuery := `SELECT t.status, t.user_id FROM Ticket t WHERE t.ticket_id = ?`
	err := dbConn.QueryRowContext(ctx, checkQuery, reportBody.TicketId).Scan(&ticketStatus, &ticketUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			return createStudentReportResponse(http.StatusNotFound,
				map[string]string{"status": "fail", "message": "Ticket not found"})
		}
		return createStudentReportResponse(http.StatusInternalServerError,
			map[string]string{"status": "error", "message": "Database error"})
	}

	// 7) Verify ticket belongs to the user
	if ticketUserID != userID {
		return createStudentReportResponse(http.StatusForbidden,
			map[string]string{"status": "fail", "message": "Ticket does not belong to you"})
	}

	// 8) Verify ticket is CHECKED_IN
	log.Info("[STUDENT_REPORT] Ticket status: %s", ticketStatus)
	if ticketStatus != "CHECKED_IN" {
		return createStudentReportResponse(http.StatusBadRequest,
			map[string]string{"status": "fail", "message": "Bạn phải check-in trước khi báo cáo lỗi"})
	}

	// 9) Check for duplicate report (One Ticket - One Report vĩnh viễn)
	// Không cho phép tạo report mới nếu ticket này đã có report ở bất kỳ trạng thái nào (PENDING, APPROVED, REJECTED)
	var existingCount int
	dupQuery := `SELECT COUNT(*) FROM report WHERE ticket_id = ? AND status IN ('PENDING', 'APPROVED', 'REJECTED')`
	dbConn.QueryRowContext(ctx, dupQuery, reportBody.TicketId).Scan(&existingCount)
	if existingCount > 0 {
		return createStudentReportResponse(http.StatusConflict,
			map[string]string{"status": "fail", "message": "Mỗi vé chỉ được phép gửi báo cáo một lần duy nhất. Yêu cầu của bạn đã được ghi nhận hoặc xử lý trước đó."})
	}

	// 10) Insert report
	now := time.Now()
	insertQuery := `
		INSERT INTO report (user_id, ticket_id, title, description, image_url, status, created_at)
		VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
	`
	result, err := dbConn.ExecContext(ctx, insertQuery,
		userID, reportBody.TicketId, reportBody.Title, reportBody.Description, reportBody.ImageUrl, now,
	)
	if err != nil {
		log.Info("[STUDENT_REPORT] Insert error: %v", err)
		return createStudentReportResponse(http.StatusInternalServerError,
			map[string]string{"status": "error", "message": "Failed to create report"})
	}

	reportID, _ := result.LastInsertId()
	log.Info("[STUDENT_REPORT] ✅ Report created: ID=%d", reportID)

	return createStudentReportResponse(http.StatusCreated, map[string]interface{}{
		"status":   "success",
		"message":  "Report submitted successfully",
		"reportId": reportID,
	})
}

// ============================================================
// HandleGetPendingTicketIDs - GET /api/student/reports/pending-ticket-ids
// Get list of ticket IDs with pending reports for current user
// KHỚP VỚI logic cũ trong main.go
// ============================================================
func (h *StudentReportHandler) HandleGetPendingTicketIDs(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract user ID from headers
	userIDStr := request.Headers["X-User-Id"]
	userID := 0
	if userIDStr != "" {
		fmt.Sscanf(userIDStr, "%d", &userID)
	}

	if userID <= 0 {
		return createStudentReportResponse(http.StatusOK, []int{})
	}

	dbConn := h.db
	if dbConn == nil {
		return createStudentReportResponse(http.StatusOK, []int{})
	}

	// Query ALL ticket IDs with reports (One Ticket - One Report vĩnh viễn)
	// Include PENDING, APPROVED, REJECTED status - return status per ticket for frontend badge display
	query := `SELECT ticket_id, status FROM Report WHERE user_id = ? AND status IN ('PENDING', 'APPROVED', 'REJECTED')`
	rows, err := dbConn.QueryContext(ctx, query, userID)
	if err != nil {
		h.logger.Warn("[STUDENT_REPORT] Failed to query pending reports: %v", err)
		return createStudentReportResponse(http.StatusOK, []map[string]interface{}{})
	}
	defer rows.Close()

	type ticketReportStatus struct {
		TicketID     int    `json:"ticketId"`
		ReportStatus string `json:"reportStatus"`
	}

	var reportStatuses []ticketReportStatus
	for rows.Next() {
		var item ticketReportStatus
		if err := rows.Scan(&item.TicketID, &item.ReportStatus); err == nil {
			reportStatuses = append(reportStatuses, item)
		}
	}

	if reportStatuses == nil {
		reportStatuses = []ticketReportStatus{}
	}

	return createStudentReportResponse(http.StatusOK, reportStatuses)
}

// ============================================================
// HELPERS
// ============================================================
func createStudentReportResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers: map[string]string{
				"Content-Type":                     "application/json;charset=UTF-8",
				"Access-Control-Allow-Origin":      "*",
				"Access-Control-Allow-Credentials": "true",
			},
			Body: `{"status":"error","message":"Failed to serialize response"}`,
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
