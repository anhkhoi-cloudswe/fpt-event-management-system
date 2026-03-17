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
)

// ============================================================
// Ticket Internal Handler - APIs nội bộ cho Microservices
//
// Các API này KHÔNG được expose ra ngoài (Frontend không gọi):
//   1. GET /internal/category-ticket/info?id=              → Thông tin 1 category ticket
//   2. GET /internal/category-tickets/by-event?eventId=    → Danh sách category tickets theo event
//   3. GET /internal/tickets/seat-statuses?eventId=&seatIds= → Booking status cho seats
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// TicketInternalHandler xử lý các request nội bộ từ service khác
type TicketInternalHandler struct {
	db     *sql.DB
	logger *logger.Logger
}

// NewTicketInternalHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewTicketInternalHandlerWithDB(dbConn *sql.DB) *TicketInternalHandler {
	return &TicketInternalHandler{
		db:     dbConn,
		logger: logger.Default(),
	}
}

// CategoryTicketDTO dữ liệu trả về cho internal API
type CategoryTicketDTO struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	Name             string  `json:"name"`
	Price            float64 `json:"price"`
	EventID          int     `json:"eventId"`
}

// SeatStatusDTO trạng thái booking của seat
type SeatStatusDTO struct {
	SeatID int    `json:"seatId"`
	Status string `json:"status"`
}

// TicketStatsDTO thống kê vé cho internal API
type TicketStatsDTO struct {
	TotalTickets    int     `json:"totalTickets"`
	CheckedInCount  int     `json:"totalCheckedIn"`
	CheckedOutCount int     `json:"totalCheckedOut"`
	BookedCount     int     `json:"bookedCount"`
	CancelledCount  int     `json:"cancelledCount"`
	RefundedCount   int     `json:"totalRefunded"`
	TotalRevenue    float64 `json:"totalRevenue"`
}

// ============================================================
//  1. HandleGetCategoryTicketInfo - GET /internal/category-ticket/info?id=
//     Trả về thông tin 1 category ticket (name, price)
//     Dùng bởi: venue-lambda → GetAllSeatsComposed
//
// ============================================================
func (h *TicketInternalHandler) HandleGetCategoryTicketInfo(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	idStr := request.QueryStringParameters["id"]
	if idStr == "" {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "id required"})
	}

	catID, err := strconv.Atoi(idStr)
	if err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var cat CategoryTicketDTO
	query := `SELECT category_ticket_id, name, price, event_id FROM category_ticket WHERE category_ticket_id = ?`
	err = h.db.QueryRowContext(ctx, query, catID).Scan(&cat.CategoryTicketID, &cat.Name, &cat.Price, &cat.EventID)
	if err != nil {
		if err == sql.ErrNoRows {
			return createTicketInternalResponse(http.StatusNotFound, map[string]string{"error": "category ticket not found"})
		}
		h.logger.Warn("[INTERNAL_TICKET] Failed to get category ticket %d: %v", catID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ GetCategoryTicketInfo: id=%d, name=%s, price=%.2f", catID, cat.Name, cat.Price)
	return createTicketInternalResponse(http.StatusOK, cat)
}

// ============================================================
//  2. HandleGetCategoryTicketsByEvent - GET /internal/category-tickets/by-event?eventId=
//     Trả về danh sách category tickets theo event
//     Dùng bởi: venue-lambda → GetSeatsForEventComposed
//
// ============================================================
func (h *TicketInternalHandler) HandleGetCategoryTicketsByEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	eventIDStr := request.QueryStringParameters["eventId"]
	if eventIDStr == "" {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "eventId required"})
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid eventId"})
	}

	query := `SELECT category_ticket_id, name, price, event_id FROM category_ticket WHERE event_id = ?`
	rows, err := h.db.QueryContext(ctx, query, eventID)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to get categories for event %d: %v", eventID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var categories []CategoryTicketDTO
	for rows.Next() {
		var cat CategoryTicketDTO
		if err := rows.Scan(&cat.CategoryTicketID, &cat.Name, &cat.Price, &cat.EventID); err != nil {
			continue
		}
		categories = append(categories, cat)
	}

	if categories == nil {
		categories = []CategoryTicketDTO{}
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ GetCategoryTicketsByEvent: eventId=%d, count=%d", eventID, len(categories))
	return createTicketInternalResponse(http.StatusOK, categories)
}

// ============================================================
//  3. HandleGetSeatStatuses - GET /internal/tickets/seat-statuses?eventId=&seatIds=1,2,3
//     Trả về booking status (AVAILABLE/BOOKED/HOLD) cho các seats
//     Dùng bởi: venue-lambda → GetSeatsForEventComposed
//
// ============================================================
func (h *TicketInternalHandler) HandleGetSeatStatuses(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	eventIDStr := request.QueryStringParameters["eventId"]
	seatIDsStr := request.QueryStringParameters["seatIds"]

	if eventIDStr == "" || seatIDsStr == "" {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "eventId and seatIds required"})
	}

	eventID, err := strconv.Atoi(eventIDStr)
	if err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid eventId"})
	}

	// Parse comma-separated seat IDs
	seatIDStrs := strings.Split(seatIDsStr, ",")
	var seatIDs []int
	for _, s := range seatIDStrs {
		s = strings.TrimSpace(s)
		if id, err := strconv.Atoi(s); err == nil {
			seatIDs = append(seatIDs, id)
		}
	}

	if len(seatIDs) == 0 {
		return createTicketInternalResponse(http.StatusOK, map[string]interface{}{"statuses": []SeatStatusDTO{}})
	}

	// Build IN clause
	placeholders := make([]string, len(seatIDs))
	args := make([]interface{}, 0, len(seatIDs)+1)
	args = append(args, eventID)
	for i, id := range seatIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}

	// Query booking statuses - same logic as GetSeatsForEvent in venue_repository.go
	query := fmt.Sprintf(`
		SELECT 
			s.seat_id,
			CASE 
				WHEN EXISTS (
					SELECT 1 FROM Ticket t
					WHERE t.event_id = ?
					  AND t.seat_id = s.seat_id
					  AND t.status IN ('BOOKED','CHECKED_IN','CHECKED_OUT','REFUNDED')
				) THEN 'BOOKED'
				WHEN EXISTS (
					SELECT 1 FROM Ticket t
					WHERE t.event_id = ?
					  AND t.seat_id = s.seat_id
					  AND t.status = 'PENDING'
				) THEN 'HOLD'
				ELSE 'AVAILABLE'
			END AS seat_status
		FROM Seat s
		WHERE s.seat_id IN (%s)
	`, strings.Join(placeholders, ","))

	// Need eventID twice for the two subqueries, then seat IDs
	finalArgs := make([]interface{}, 0, len(seatIDs)+2)
	finalArgs = append(finalArgs, eventID, eventID)
	for _, id := range seatIDs {
		finalArgs = append(finalArgs, id)
	}

	rows, err := h.db.QueryContext(ctx, query, finalArgs...)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to query seat statuses for event %d: %v", eventID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var statuses []SeatStatusDTO
	for rows.Next() {
		var s SeatStatusDTO
		if err := rows.Scan(&s.SeatID, &s.Status); err != nil {
			continue
		}
		statuses = append(statuses, s)
	}

	if statuses == nil {
		statuses = []SeatStatusDTO{}
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ GetSeatStatuses: eventId=%d, requested=%d, returned=%d", eventID, len(seatIDs), len(statuses))
	return createTicketInternalResponse(http.StatusOK, map[string]interface{}{"statuses": statuses})
}

// ============================================================
//  4. HandleGetTicketStats - GET /internal/ticket/count?eventId=
//     Trả về thống kê vé cho event (count theo status)
//     Dùng bởi: event-lambda GetEventStats (thay thế JOIN Ticket)
//
// ============================================================
func (h *TicketInternalHandler) HandleGetTicketStats(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	eventIDStr := request.QueryStringParameters["eventId"]

	// Nếu có eventId → stats cho 1 event, nếu không → aggregate stats
	if eventIDStr != "" {
		eventID, err := strconv.Atoi(eventIDStr)
		if err != nil {
			return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid eventId"})
		}

		query := `
			SELECT 
				COUNT(DISTINCT t.ticket_id) as total_tickets,
				COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
				COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
				COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
				COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
				COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
				COALESCE(SUM(ct.price), 0) as total_revenue
			FROM Category_Ticket ct
			LEFT JOIN Ticket t ON ct.category_ticket_id = t.category_ticket_id 
				AND t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
			WHERE ct.event_id = ?
		`

		var stats TicketStatsDTO
		err = h.db.QueryRowContext(ctx, query, eventID).Scan(
			&stats.TotalTickets,
			&stats.CheckedInCount,
			&stats.CheckedOutCount,
			&stats.BookedCount,
			&stats.CancelledCount,
			&stats.RefundedCount,
			&stats.TotalRevenue,
		)
		if err != nil {
			if err == sql.ErrNoRows {
				return createTicketInternalResponse(http.StatusOK, TicketStatsDTO{})
			}
			h.logger.Warn("[INTERNAL_TICKET] Failed to get ticket stats for event %d: %v", eventID, err)
			return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
		}

		h.logger.Info("[INTERNAL_TICKET] ✅ GetTicketStats: eventId=%d, total=%d, revenue=%.2f", eventID, stats.TotalTickets, stats.TotalRevenue)
		return createTicketInternalResponse(http.StatusOK, stats)
	}

	// Aggregate stats (all events) - dùng khi eventId=0 hoặc không có eventId
	// optional filter by organizerId
	organizerIDStr := request.QueryStringParameters["organizerId"]

	var query string
	var args []interface{}

	if organizerIDStr != "" {
		organizerID, err := strconv.Atoi(organizerIDStr)
		if err != nil {
			return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid organizerId"})
		}
		query = `
			SELECT 
				COUNT(DISTINCT t.ticket_id) as total_tickets,
				COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
				COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
				COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
				COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
				COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
				COALESCE(SUM(ct.price), 0) as total_revenue
			FROM Ticket t
			INNER JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			INNER JOIN Event e ON ct.event_id = e.event_id
			WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
			AND e.created_by = ?
		`
		args = append(args, organizerID)
	} else {
		query = `
			SELECT 
				COUNT(DISTINCT t.ticket_id) as total_tickets,
				COUNT(DISTINCT CASE WHEN t.checkin_time IS NOT NULL THEN t.ticket_id END) as checked_in,
				COUNT(DISTINCT CASE WHEN t.check_out_time IS NOT NULL THEN t.ticket_id END) as checked_out,
				COUNT(DISTINCT CASE WHEN t.status = 'BOOKED' THEN t.ticket_id END) as booked,
				COUNT(DISTINCT CASE WHEN t.status = 'CANCELLED' THEN t.ticket_id END) as cancelled,
				COUNT(DISTINCT CASE WHEN t.status = 'REFUNDED' THEN t.ticket_id END) as refunded,
				COALESCE(SUM(ct.price), 0) as total_revenue
			FROM Ticket t
			INNER JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			INNER JOIN Event e ON ct.event_id = e.event_id
			WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'REFUNDED')
		`
	}

	var stats TicketStatsDTO
	var err error
	if len(args) > 0 {
		err = h.db.QueryRowContext(ctx, query, args...).Scan(
			&stats.TotalTickets,
			&stats.CheckedInCount,
			&stats.CheckedOutCount,
			&stats.BookedCount,
			&stats.CancelledCount,
			&stats.RefundedCount,
			&stats.TotalRevenue,
		)
	} else {
		err = h.db.QueryRowContext(ctx, query).Scan(
			&stats.TotalTickets,
			&stats.CheckedInCount,
			&stats.CheckedOutCount,
			&stats.BookedCount,
			&stats.CancelledCount,
			&stats.RefundedCount,
			&stats.TotalRevenue,
		)
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return createTicketInternalResponse(http.StatusOK, TicketStatsDTO{})
		}
		h.logger.Warn("[INTERNAL_TICKET] Failed to get aggregate ticket stats: %v", err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ GetTicketStats (aggregate): total=%d, revenue=%.2f", stats.TotalTickets, stats.TotalRevenue)
	return createTicketInternalResponse(http.StatusOK, stats)
}

// ============================================================
//  5. HandleRefundTicket - POST /internal/ticket/refund
//     Đổi trạng thái vé sang REFUNDED (Saga Step 1 cho Refund flow)
//     Chỉ refund vé đang CHECKED_IN
//     Body: {"ticketId": 123}
//     Response: {"success": true, "ticketId": 123, "previousStatus": "CHECKED_IN"}
//
// ============================================================

// TicketRefundRequest request body cho refund
type TicketRefundRequest struct {
	TicketID int `json:"ticketId"`
}

// TicketRefundResponse response cho refund
type TicketRefundResponse struct {
	Success        bool   `json:"success"`
	TicketID       int    `json:"ticketId"`
	PreviousStatus string `json:"previousStatus,omitempty"`
	Message        string `json:"message"`
}

func (h *TicketInternalHandler) HandleRefundTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req TicketRefundRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.TicketID <= 0 {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "ticketId must be positive"})
	}

	// Get current ticket status
	var currentStatus string
	err := h.db.QueryRowContext(ctx, "SELECT status FROM Ticket WHERE ticket_id = ?", req.TicketID).Scan(&currentStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			return createTicketInternalResponse(http.StatusNotFound, TicketRefundResponse{
				Success:  false,
				TicketID: req.TicketID,
				Message:  "ticket not found",
			})
		}
		h.logger.Warn("[INTERNAL_TICKET] Failed to get ticket %d: %v", req.TicketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	if currentStatus != "CHECKED_IN" {
		return createTicketInternalResponse(http.StatusBadRequest, TicketRefundResponse{
			Success:        false,
			TicketID:       req.TicketID,
			PreviousStatus: currentStatus,
			Message:        fmt.Sprintf("ticket status is %s, expected CHECKED_IN", currentStatus),
		})
	}

	// Update ticket status to REFUNDED (optimistic locking)
	result, err := h.db.ExecContext(ctx,
		"UPDATE Ticket SET status = 'REFUNDED' WHERE ticket_id = ? AND status = 'CHECKED_IN'",
		req.TicketID,
	)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to refund ticket %d: %v", req.TicketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "update failed"})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return createTicketInternalResponse(http.StatusConflict, TicketRefundResponse{
			Success:  false,
			TicketID: req.TicketID,
			Message:  "ticket status changed concurrently, refund failed",
		})
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ RefundTicket: ticketId=%d, previousStatus=%s → REFUNDED", req.TicketID, currentStatus)
	return createTicketInternalResponse(http.StatusOK, TicketRefundResponse{
		Success:        true,
		TicketID:       req.TicketID,
		PreviousStatus: currentStatus,
		Message:        "ticket refunded successfully",
	})
}

// ============================================================
//  6. HandleRevertRefund - POST /internal/ticket/revert-refund
//     Compensation: Hoàn tác refund → chuyển vé lại thành BOOKED
//     Body: {"ticketId": 123, "targetStatus": "CHECKED_IN"}
//
// ============================================================

// TicketRevertRefundRequest request body cho revert refund
type TicketRevertRefundRequest struct {
	TicketID     int    `json:"ticketId"`
	TargetStatus string `json:"targetStatus"` // CHECKED_IN or BOOKED
}

func (h *TicketInternalHandler) HandleRevertRefund(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req TicketRevertRefundRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.TicketID <= 0 {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "ticketId must be positive"})
	}

	targetStatus := req.TargetStatus
	if targetStatus == "" {
		targetStatus = "CHECKED_IN" // Default: revert back to CHECKED_IN
	}

	result, err := h.db.ExecContext(ctx,
		"UPDATE Ticket SET status = ? WHERE ticket_id = ? AND status = 'REFUNDED'",
		targetStatus, req.TicketID,
	)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to revert refund ticket %d: %v", req.TicketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "revert failed"})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		h.logger.Warn("[INTERNAL_TICKET] ⚠️ RevertRefund: ticket %d not in REFUNDED status (may already be reverted)", req.TicketID)
		return createTicketInternalResponse(http.StatusOK, TicketRefundResponse{
			Success:  true,
			TicketID: req.TicketID,
			Message:  "ticket already reverted or not in REFUNDED status",
		})
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ RevertRefund: ticketId=%d → %s (compensation)", req.TicketID, targetStatus)
	return createTicketInternalResponse(http.StatusOK, TicketRefundResponse{
		Success:  true,
		TicketID: req.TicketID,
		Message:  fmt.Sprintf("ticket reverted to %s", targetStatus),
	})
}

// ============================================================
//  7. HandleCheckinTicket - POST /internal/ticket/checkin
//     Check-in vé qua API nội bộ (thay vì UPDATE trực tiếp)
//     Body: {"ticketId": 123}
//
// ============================================================

// TicketCheckinRequest request body cho checkin
type TicketCheckinRequest struct {
	TicketID int `json:"ticketId"`
}

// TicketCheckinResponse response cho checkin
type TicketCheckinResponse struct {
	Success      bool   `json:"success"`
	TicketID     int    `json:"ticketId"`
	Message      string `json:"message"`
	RowsAffected int64  `json:"rowsAffected,omitempty"`
}

func (h *TicketInternalHandler) HandleCheckinTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req TicketCheckinRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.TicketID <= 0 {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "ticketId must be positive"})
	}

	// Optimistic locking: only update if status = BOOKED
	result, err := h.db.ExecContext(ctx,
		"UPDATE Ticket SET status = 'CHECKED_IN', checkin_time = NOW() WHERE ticket_id = ? AND status = 'BOOKED'",
		req.TicketID,
	)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to checkin ticket %d: %v", req.TicketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "checkin failed"})
	}

	rowsAffected, _ := result.RowsAffected()

	h.logger.Info("[INTERNAL_TICKET] ✅ CheckinTicket: ticketId=%d, rowsAffected=%d", req.TicketID, rowsAffected)
	return createTicketInternalResponse(http.StatusOK, TicketCheckinResponse{
		Success:      rowsAffected > 0,
		TicketID:     req.TicketID,
		RowsAffected: rowsAffected,
		Message:      fmt.Sprintf("checkin %s", map[bool]string{true: "successful", false: "failed (ticket not BOOKED or already checked in)"}[rowsAffected > 0]),
	})
}

// ============================================================
//  8. HandleCheckoutTicket - POST /internal/ticket/checkout
//     Check-out vé qua API nội bộ
//     Body: {"ticketId": 123}
//
// ============================================================
func (h *TicketInternalHandler) HandleCheckoutTicket(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req TicketCheckinRequest // Same structure
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.TicketID <= 0 {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "ticketId must be positive"})
	}

	// Optimistic locking: only update if status = CHECKED_IN
	result, err := h.db.ExecContext(ctx,
		"UPDATE Ticket SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE ticket_id = ? AND status = 'CHECKED_IN'",
		req.TicketID,
	)
	if err != nil {
		h.logger.Warn("[INTERNAL_TICKET] Failed to checkout ticket %d: %v", req.TicketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "checkout failed"})
	}

	rowsAffected, _ := result.RowsAffected()

	h.logger.Info("[INTERNAL_TICKET] ✅ CheckoutTicket: ticketId=%d, rowsAffected=%d", req.TicketID, rowsAffected)
	return createTicketInternalResponse(http.StatusOK, TicketCheckinResponse{
		Success:      rowsAffected > 0,
		TicketID:     req.TicketID,
		RowsAffected: rowsAffected,
		Message:      fmt.Sprintf("checkout %s", map[bool]string{true: "successful", false: "failed (ticket not CHECKED_IN)"}[rowsAffected > 0]),
	})
}

// ============================================================
//  9. HandleGetTicketInfo - GET /internal/ticket/info?ticketId=
//     Lấy thông tin vé bao gồm: status, userId, categoryTicketId, price
//     Dùng cho: staff-lambda → GetReportDetail (thay thế JOIN)
//
// ============================================================

// TicketInfoDTO thông tin vé cho internal API
type TicketInfoDTO struct {
	TicketID         int     `json:"ticketId"`
	UserID           int     `json:"userId"`
	Status           string  `json:"status"`
	CategoryTicketID int     `json:"categoryTicketId"`
	SeatID           *int    `json:"seatId,omitempty"`
	CategoryName     string  `json:"categoryName"`
	Price            float64 `json:"price"`
}

func (h *TicketInternalHandler) HandleGetTicketInfo(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	ticketIDStr := request.QueryStringParameters["ticketId"]
	if ticketIDStr == "" {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "ticketId required"})
	}

	ticketID, err := strconv.Atoi(ticketIDStr)
	if err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid ticketId"})
	}

	var info TicketInfoDTO
	var seatID sql.NullInt64
	query := `
		SELECT t.ticket_id, t.user_id, t.status, t.category_ticket_id, t.seat_id,
		       ct.name, ct.price
		FROM Ticket t
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		WHERE t.ticket_id = ?
	`
	err = h.db.QueryRowContext(ctx, query, ticketID).Scan(
		&info.TicketID, &info.UserID, &info.Status, &info.CategoryTicketID, &seatID,
		&info.CategoryName, &info.Price,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return createTicketInternalResponse(http.StatusNotFound, map[string]string{"error": "ticket not found"})
		}
		h.logger.Warn("[INTERNAL_TICKET] Failed to get ticket info %d: %v", ticketID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	if seatID.Valid {
		val := int(seatID.Int64)
		info.SeatID = &val
	}

	h.logger.Info("[INTERNAL_TICKET] ✅ GetTicketInfo: ticketId=%d, status=%s, price=%.2f", ticketID, info.Status, info.Price)
	return createTicketInternalResponse(http.StatusOK, info)
}

// ============================================================
// HandleRefundAllByEvent - POST /internal/tickets/refund-all-by-event
// Hoàn tiền 100% cho toàn bộ ticket đang hoạt động của sự kiện bị hủy
// Body: {"eventId": int}
// Security: X-Internal-Call = "true"
// ============================================================

type RefundAllByEventRequest struct {
	EventID int `json:"eventId"`
}

type RefundAllByEventResponse struct {
	Success     bool    `json:"success"`
	EventID     int     `json:"eventId"`
	Refunded    int     `json:"refunded"`
	TotalAmount float64 `json:"totalAmount"`
	Message     string  `json:"message"`
}

type ticketRefundInfo struct {
	TicketID int
	UserID   int
	Price    float64
	Email    string
	FullName string
}

type cancelEmailRequest struct {
	To       string `json:"to"`
	Subject  string `json:"subject"`
	Type     string `json:"type"`
	HTMLBody string `json:"htmlBody"`
}

func (h *TicketInternalHandler) HandleRefundAllByEvent(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketInternalCall(request) {
		return createTicketInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req RefundAllByEventRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}
	if req.EventID <= 0 {
		return createTicketInternalResponse(http.StatusBadRequest, map[string]string{"error": "eventId must be positive"})
	}

	// Query all refundable tickets with user email and price
	rows, err := h.db.QueryContext(ctx, `
		SELECT t.ticket_id, t.user_id, ct.price, u.email, COALESCE(u.full_name, u.email)
		FROM ticket t
		JOIN category_ticket ct ON t.category_ticket_id = ct.category_ticket_id
		JOIN users u ON t.user_id = u.user_id
		WHERE t.event_id = ? AND t.status IN ('BOOKED', 'PENDING', 'CHECKED_IN')
	`, req.EventID)
	if err != nil {
		h.logger.Warn("[TICKET] ❌ RefundAllByEvent: query tickets failed for event %d: %v", req.EventID, err)
		return createTicketInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	var tickets []ticketRefundInfo
	for rows.Next() {
		var t ticketRefundInfo
		if err := rows.Scan(&t.TicketID, &t.UserID, &t.Price, &t.Email, &t.FullName); err != nil {
			continue
		}
		tickets = append(tickets, t)
	}
	rows.Close()

	refunded := 0
	var totalAmount float64

	for _, t := range tickets {
		tx, err := h.db.BeginTx(ctx, nil)
		if err != nil {
			h.logger.Warn("[TICKET] ⚠️ RefundAllByEvent: begin tx failed for ticket %d: %v", t.TicketID, err)
			continue
		}

		// Mark ticket as REFUNDED (optimistic: only if still active)
		res, err := tx.ExecContext(ctx,
			"UPDATE ticket SET status = 'REFUNDED' WHERE ticket_id = ? AND status IN ('BOOKED', 'PENDING', 'CHECKED_IN')",
			t.TicketID,
		)
		if err != nil {
			tx.Rollback()
			h.logger.Warn("[TICKET] ⚠️ RefundAllByEvent: update ticket %d failed: %v", t.TicketID, err)
			continue
		}
		affected, _ := res.RowsAffected()
		if affected == 0 {
			tx.Rollback()
			continue // Concurrently changed
		}

		// Ensure wallet exists for user
		tx.ExecContext(ctx, "INSERT IGNORE INTO Wallet (user_id, balance) VALUES (?, 0)", t.UserID)

		// Lock wallet row and get balance
		var walletID int
		var currentBalance float64
		err = tx.QueryRowContext(ctx,
			"SELECT wallet_id, balance FROM Wallet WHERE user_id = ? FOR UPDATE", t.UserID,
		).Scan(&walletID, &currentBalance)
		if err != nil {
			tx.Rollback()
			h.logger.Warn("[TICKET] ⚠️ RefundAllByEvent: lock wallet failed for user %d: %v", t.UserID, err)
			continue
		}

		newBalance := currentBalance + t.Price
		_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = ? WHERE wallet_id = ?", newBalance, walletID)
		if err != nil {
			tx.Rollback()
			h.logger.Warn("[TICKET] ⚠️ RefundAllByEvent: update wallet failed for user %d: %v", t.UserID, err)
			continue
		}

		_, _ = tx.ExecContext(ctx,
			`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
			 VALUES (?, ?, 'CREDIT', ?, ?, ?, 'TICKET', ?, ?)`,
			walletID, t.UserID, t.Price, currentBalance, newBalance,
			t.TicketID,
			fmt.Sprintf("Hoàn tiền 100%% vé #%d - sự kiện bị hủy", t.TicketID),
		)

		if err := tx.Commit(); err != nil {
			h.logger.Warn("[TICKET] ⚠️ RefundAllByEvent: commit failed for ticket %d: %v", t.TicketID, err)
			continue
		}

		refunded++
		totalAmount += t.Price
		h.logger.Info("[TICKET] Refunded %.0f VND to User %d (ticket #%d)", t.Price, t.UserID, t.TicketID)

		// Fire cancellation email asynchronously
		go func(email, name string, price float64, ticketID int) {
			notifyURL := utils.GetNotificationServiceURL() + "/internal/notify/email"
			emailPayload := cancelEmailRequest{
				To:      email,
				Subject: "[FPT Event] Sự kiện đã bị hủy - Hoàn tiền vé",
				Type:    "generic",
				HTMLBody: fmt.Sprintf(
					`<p>Xin chào <b>%s</b>,</p>
					<p>Sự kiện bạn đăng ký đã bị hủy. Chúng tôi đã hoàn tiền <b>%.0f VND</b> vào ví FPT Event của bạn cho vé #%d.</p>
					<p>Vui lòng đăng nhập để kiểm tra số dư ví.</p>
					<p>Xin lỗi vì sự bất tiện này!</p>`,
					name, price, ticketID,
				),
			}
			utils.NewInternalClient().Post(context.Background(), notifyURL, emailPayload)
		}(t.Email, t.FullName, t.Price, t.TicketID)
	}

	h.logger.Info("[TICKET] ✅ RefundAllByEvent done: eventId=%d, refunded=%d tickets, totalAmount=%.2f", req.EventID, refunded, totalAmount)
	return createTicketInternalResponse(http.StatusOK, RefundAllByEventResponse{
		Success:     true,
		EventID:     req.EventID,
		Refunded:    refunded,
		TotalAmount: totalAmount,
		Message:     fmt.Sprintf("Đã hoàn tiền cho %d vé, tổng %.0f VND", refunded, totalAmount),
	})
}

// ============================================================
// HELPERS
// ============================================================

func isTicketInternalCall(request events.APIGatewayProxyRequest) bool {
	return utils.IsValidInternalToken(request.Headers)
}

func createTicketInternalResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
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
