package repository

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/staff-lambda/models"
)

// StaffRepository handles staff-related database operations
type StaffRepository struct {
	db *sql.DB
}

// NewStaffRepositoryWithDB creates a new staff repository with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton db.GetDB() allowed
func NewStaffRepositoryWithDB(dbConn *sql.DB) *StaffRepository {
	return &StaffRepository{
		db: dbConn,
	}
}

// ============================================================
// GetTicketForCheckin - Lấy thông tin vé cho check-in
// KHỚP VỚI Java TicketDAO
// ⭐ Phase 5: Khi TICKET_API_ENABLED → API Composition
// ============================================================
func (r *StaffRepository) GetTicketForCheckin(ctx context.Context, ticketID int) (*models.TicketForCheckin, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) {
		return r.getTicketForCheckinAPI(ctx, ticketID)
	}
	return r.getTicketForCheckinJoin(ctx, ticketID)
}

// getTicketForCheckinAPI - API Composition: gọi /internal/ticket/info + local Event query
func (r *StaffRepository) getTicketForCheckinAPI(ctx context.Context, ticketID int) (*models.TicketForCheckin, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 GetTicketForCheckin via API: ticketID=%d", ticketID)

	client := utils.NewInternalClient()
	ctx = utils.WithRequestHeaders(ctx, map[string]string{"X-Internal-Call": "true"})
	ticketURL := utils.GetTicketServiceURL()

	// 1) Gọi /internal/ticket/info → ticket basic info
	type ticketInfoResp struct {
		TicketID         int     `json:"ticketId"`
		UserID           int     `json:"userId"`
		Status           string  `json:"status"`
		CategoryTicketID int     `json:"categoryTicketId"`
		SeatID           *int    `json:"seatId,omitempty"`
		CategoryName     string  `json:"categoryName"`
		Price            float64 `json:"price"`
	}
	var ticketInfo ticketInfoResp
	statusCode, err := client.GetJSON(ctx, ticketURL+"/internal/ticket/info",
		map[string]string{"ticketId": strconv.Itoa(ticketID)}, &ticketInfo)
	if err != nil || statusCode != http.StatusOK {
		log.Info("[API_COMPOSITION] ⚠️ Ticket API failed, falling back to JOIN for ticketID=%d", ticketID)
		return r.getTicketForCheckinJoin(ctx, ticketID)
	}

	// 2) Query local: Ticket extra fields (qr_code, checkin_time, checkout_time) + Event info via category_ticket
	var ticket models.TicketForCheckin
	ticket.TicketID = ticketInfo.TicketID
	ticket.Status = ticketInfo.Status
	ticket.CategoryTicketID = ticketInfo.CategoryTicketID

	var (
		qrCodeValue  string
		checkInTime  sql.NullTime
		checkOutTime sql.NullTime
		seatCode     sql.NullString
	)

	query := `
		SELECT t.qr_code_value, t.checkin_time, t.check_out_time,
		       e.event_id, e.title, e.start_time, e.end_time, e.checkin_offset, e.checkout_offset,
		       s.seat_code,
		       COALESCE(u.full_name, 'Khách hàng'), COALESCE(u.email, '')
		FROM Ticket t
		JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		JOIN Event e ON ct.event_id = e.event_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE t.ticket_id = ?
	`
	err = r.db.QueryRowContext(ctx, query, ticketID).Scan(
		&qrCodeValue, &checkInTime, &checkOutTime,
		&ticket.EventID, &ticket.EventName, &ticket.EventStartTime, &ticket.EventEndTime,
		&ticket.EventCheckinOffset, &ticket.EventCheckoutOffset,
		&seatCode,
		&ticket.CustomerName, &ticket.CustomerEmail,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get ticket extra info: %w", err)
	}

	ticket.TicketCode = qrCodeValue

	// Load ICT timezone
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.FixedZone("ICT", 7*60*60)
	}
	ticket.EventStartTime = time.Date(
		ticket.EventStartTime.Year(), ticket.EventStartTime.Month(), ticket.EventStartTime.Day(),
		ticket.EventStartTime.Hour(), ticket.EventStartTime.Minute(), ticket.EventStartTime.Second(),
		ticket.EventStartTime.Nanosecond(), loc,
	)
	ticket.EventEndTime = time.Date(
		ticket.EventEndTime.Year(), ticket.EventEndTime.Month(), ticket.EventEndTime.Day(),
		ticket.EventEndTime.Hour(), ticket.EventEndTime.Minute(), ticket.EventEndTime.Second(),
		ticket.EventEndTime.Nanosecond(), loc,
	)

	if checkInTime.Valid {
		ticket.CheckInTime = &checkInTime.Time
	}
	if checkOutTime.Valid {
		ticket.CheckOutTime = &checkOutTime.Time
	}
	if seatCode.Valid {
		ticket.SeatCode = &seatCode.String
	}

	log.Info("[API_COMPOSITION] ✅ GetTicketForCheckin: ticketID=%d, status=%s via API+local", ticketID, ticket.Status)
	return &ticket, nil
}

// getTicketForCheckinJoin - Logic cũ (monolith JOIN)
func (r *StaffRepository) getTicketForCheckinJoin(ctx context.Context, ticketID int) (*models.TicketForCheckin, error) {
	query := `
		SELECT 
			t.ticket_id,
			t.qr_code_value,
			t.status,
			t.checkin_time,
			t.check_out_time,
			e.event_id,
			e.title AS event_name,
			e.start_time,
			e.end_time,
			e.checkin_offset,
			e.checkout_offset,
			s.seat_code,
			t.category_ticket_id,
			COALESCE(u.full_name, 'Khách hàng') AS customer_name,
			COALESCE(u.email, '') AS customer_email
		FROM Ticket t
		JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		JOIN Event e ON ct.event_id = e.event_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE t.ticket_id = ?
	`

	fmt.Printf("[CHECK-IN DEBUG] Executing Query: %s with ticket_id=%d\n", query, ticketID)

	var ticket models.TicketForCheckin
	var (
		qrCodeValue  string
		checkInTime  sql.NullTime
		checkOutTime sql.NullTime
		seatCode     sql.NullString
	)

	err := r.db.QueryRowContext(ctx, query, ticketID).Scan(
		&ticket.TicketID,
		&qrCodeValue,
		&ticket.Status,
		&checkInTime,
		&checkOutTime,
		&ticket.EventID,
		&ticket.EventName,
		&ticket.EventStartTime,
		&ticket.EventEndTime,
		&ticket.EventCheckinOffset,
		&ticket.EventCheckoutOffset,
		&seatCode,
		&ticket.CategoryTicketID,
		&ticket.CustomerName,
		&ticket.CustomerEmail,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get ticket: %w", err)
	}

	// Map qr_code_value to TicketCode
	ticket.TicketCode = qrCodeValue

	// Load ICT timezone to interpret datetime from database
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		loc = time.FixedZone("ICT", 7*60*60)
	}

	// Convert event times to ICT timezone (database stores datetime without timezone)
	ticket.EventStartTime = time.Date(
		ticket.EventStartTime.Year(),
		ticket.EventStartTime.Month(),
		ticket.EventStartTime.Day(),
		ticket.EventStartTime.Hour(),
		ticket.EventStartTime.Minute(),
		ticket.EventStartTime.Second(),
		ticket.EventStartTime.Nanosecond(),
		loc,
	)
	ticket.EventEndTime = time.Date(
		ticket.EventEndTime.Year(),
		ticket.EventEndTime.Month(),
		ticket.EventEndTime.Day(),
		ticket.EventEndTime.Hour(),
		ticket.EventEndTime.Minute(),
		ticket.EventEndTime.Second(),
		ticket.EventEndTime.Nanosecond(),
		loc,
	)

	if checkInTime.Valid {
		ticket.CheckInTime = &checkInTime.Time
	}
	if checkOutTime.Valid {
		ticket.CheckOutTime = &checkOutTime.Time
	}
	if seatCode.Valid {
		ticket.SeatCode = &seatCode.String
	}

	return &ticket, nil
}

// ============================================================
// GetTicketByCode - Lấy vé theo qr_code_value
// ============================================================
func (r *StaffRepository) GetTicketByCode(ctx context.Context, qrCodeValue string) (*models.TicketForCheckin, error) {
	query := `
		SELECT 
			t.ticket_id,
			t.qr_code_value,
			t.status,
			t.checkin_time,
			t.check_out_time,
			e.event_id,
			e.title AS event_name,
			e.start_time,
			e.end_time,
			e.checkin_offset,
			e.checkout_offset,
			s.seat_code,
			t.category_ticket_id
		FROM Ticket t
		JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		JOIN Event e ON ct.event_id = e.event_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		WHERE t.qr_code_value = ?
	`

	var ticket models.TicketForCheckin
	var (
		qrCode       string
		checkInTime  sql.NullTime
		checkOutTime sql.NullTime
		seatCode     sql.NullString
	)

	err := r.db.QueryRowContext(ctx, query, qrCodeValue).Scan(
		&ticket.TicketID,
		&qrCode,
		&ticket.Status,
		&checkInTime,
		&checkOutTime,
		&ticket.EventID,
		&ticket.EventName,
		&ticket.EventStartTime,
		&ticket.EventEndTime,
		&ticket.EventCheckinOffset,
		&ticket.EventCheckoutOffset,
		&seatCode,
		&ticket.CategoryTicketID,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get ticket: %w", err)
	}

	// Map qr_code_value to TicketCode
	ticket.TicketCode = qrCode

	if checkInTime.Valid {
		ticket.CheckInTime = &checkInTime.Time
	}
	if checkOutTime.Valid {
		ticket.CheckOutTime = &checkOutTime.Time
	}
	if seatCode.Valid {
		ticket.SeatCode = &seatCode.String
	}

	return &ticket, nil
}

// ============================================================
// UpdateTicketCheckin - Update trạng thái check-in với race condition protection
// KHỚP VỚI Java TicketDAO.updateCheckin
// ⭐ Phase 5: Khi TICKET_API_ENABLED → gọi /internal/ticket/checkin
// ============================================================
func (r *StaffRepository) UpdateTicketCheckin(ctx context.Context, ticketID int) (int64, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) {
		return r.updateTicketCheckinAPI(ctx, ticketID)
	}
	return r.updateTicketCheckinLocal(ctx, ticketID)
}

// updateTicketCheckinAPI - Gọi internal API thay vì UPDATE trực tiếp
func (r *StaffRepository) updateTicketCheckinAPI(ctx context.Context, ticketID int) (int64, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 UpdateTicketCheckin via API: ticketID=%d", ticketID)

	client := utils.NewInternalClient()
	ctx = utils.WithRequestHeaders(ctx, map[string]string{"X-Internal-Call": "true"})
	ticketURL := utils.GetTicketServiceURL()

	type checkinResp struct {
		Success      bool   `json:"success"`
		TicketID     int    `json:"ticketId"`
		RowsAffected int64  `json:"rowsAffected"`
		Message      string `json:"message"`
	}
	var resp checkinResp
	statusCode, err := client.PostJSON(ctx, ticketURL+"/internal/ticket/checkin",
		map[string]int{"ticketId": ticketID}, &resp)
	if err != nil || statusCode != http.StatusOK {
		log.Info("[API_COMPOSITION] ⚠️ Checkin API failed, falling back to local for ticketID=%d", ticketID)
		return r.updateTicketCheckinLocal(ctx, ticketID)
	}

	log.Info("[API_COMPOSITION] ✅ CheckinTicket via API: ticketID=%d, rowsAffected=%d", ticketID, resp.RowsAffected)
	return resp.RowsAffected, nil
}

// updateTicketCheckinLocal - Logic cũ (direct UPDATE)
func (r *StaffRepository) updateTicketCheckinLocal(ctx context.Context, ticketID int) (int64, error) {
	// Chỉ update nếu status hiện tại là BOOKED (chống race condition)
	query := `UPDATE Ticket SET status = 'CHECKED_IN', checkin_time = NOW() WHERE ticket_id = ? AND status = 'BOOKED'`

	result, err := r.db.ExecContext(ctx, query, ticketID)
	if err != nil {
		return 0, fmt.Errorf("failed to update checkin: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return rowsAffected, nil
}

// ============================================================
// UpdateTicketCheckout - Update trạng thái check-out với race condition protection
// KHỚP VỚI Java TicketDAO.updateCheckout
// ⭐ Phase 5: Khi TICKET_API_ENABLED → gọi /internal/ticket/checkout
// ============================================================
func (r *StaffRepository) UpdateTicketCheckout(ctx context.Context, ticketID int) (int64, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) {
		return r.updateTicketCheckoutAPI(ctx, ticketID)
	}
	return r.updateTicketCheckoutLocal(ctx, ticketID)
}

// updateTicketCheckoutAPI - Gọi internal API thay vì UPDATE trực tiếp
func (r *StaffRepository) updateTicketCheckoutAPI(ctx context.Context, ticketID int) (int64, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 UpdateTicketCheckout via API: ticketID=%d", ticketID)

	client := utils.NewInternalClient()
	ctx = utils.WithRequestHeaders(ctx, map[string]string{"X-Internal-Call": "true"})
	ticketURL := utils.GetTicketServiceURL()

	type checkoutResp struct {
		Success      bool   `json:"success"`
		TicketID     int    `json:"ticketId"`
		RowsAffected int64  `json:"rowsAffected"`
		Message      string `json:"message"`
	}
	var resp checkoutResp
	statusCode, err := client.PostJSON(ctx, ticketURL+"/internal/ticket/checkout",
		map[string]int{"ticketId": ticketID}, &resp)
	if err != nil || statusCode != http.StatusOK {
		log.Info("[API_COMPOSITION] ⚠️ Checkout API failed, falling back to local for ticketID=%d", ticketID)
		return r.updateTicketCheckoutLocal(ctx, ticketID)
	}

	log.Info("[API_COMPOSITION] ✅ CheckoutTicket via API: ticketID=%d, rowsAffected=%d", ticketID, resp.RowsAffected)
	return resp.RowsAffected, nil
}

// updateTicketCheckoutLocal - Logic cũ (direct UPDATE)
func (r *StaffRepository) updateTicketCheckoutLocal(ctx context.Context, ticketID int) (int64, error) {
	// Chỉ update nếu status hiện tại là CHECKED_IN (chống race condition)
	query := `UPDATE Ticket SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE ticket_id = ? AND status = 'CHECKED_IN'`

	result, err := r.db.ExecContext(ctx, query, ticketID)
	if err != nil {
		return 0, fmt.Errorf("failed to update checkout: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return rowsAffected, nil
}

// ============================================================
// GetSystemConfig - Lấy config hệ thống
// KHỚP VỚI Java SystemConfigService
// ============================================================
func (r *StaffRepository) GetSystemConfig(ctx context.Context, key string) (string, error) {
	query := `SELECT config_value FROM System_Config WHERE config_key = ?`

	var value string
	err := r.db.QueryRowContext(ctx, query, key).Scan(&value)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("failed to get config: %w", err)
	}

	return value, nil
}

// ============================================================
// GetCheckinWindow - Lấy thời gian cho phép check-in trước sự kiện (phút)
// ============================================================
func (r *StaffRepository) GetCheckinWindow(ctx context.Context) (int, error) {
	value, err := r.GetSystemConfig(ctx, "checkin_window_minutes")
	if err != nil {
		return 30, nil // Default 30 phút
	}
	if value == "" {
		return 30, nil
	}

	var minutes int
	fmt.Sscanf(value, "%d", &minutes)
	if minutes <= 0 {
		return 30, nil
	}

	return minutes, nil
}

// ============================================================
// GetCheckoutMinMinutes - Lấy số phút tối thiểu sau start time để check-out
// ============================================================
func (r *StaffRepository) GetCheckoutMinMinutes(ctx context.Context) (int, error) {
	value, err := r.GetSystemConfig(ctx, "checkout_min_minutes_after_start")
	if err != nil {
		return 30, nil // Default 30 phút
	}
	if value == "" {
		return 30, nil
	}

	var minutes int
	fmt.Sscanf(value, "%d", &minutes)
	if minutes <= 0 {
		return 30, nil
	}

	return minutes, nil
}

// GetCurrentTime helper function - return time in ICT (GMT+7)
func (r *StaffRepository) GetCurrentTime() time.Time {
	// Load ICT timezone (Asia/Bangkok = GMT+7, same as Vietnam)
	loc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		// Fallback to UTC+7 if timezone loading fails
		loc = time.FixedZone("ICT", 7*60*60)
	}
	return time.Now().In(loc)
}

// ============================================================
// GetReportsForStaff - Lấy danh sách report cho staff
// KHỚP VỚI Java ReportDAO.listReportsForStaff()
// ⭐ Phase 5: Khi TICKET_API_ENABLED + AUTH_API_ENABLED → API Composition
// ============================================================
func (r *StaffRepository) GetReportsForStaff(ctx context.Context) ([]models.ReportListResponse, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) && config.IsFeatureEnabled(config.FlagAuthAPIEnabled) {
		return r.getReportsForStaffComposed(ctx)
	}
	return r.getReportsForStaffJoin(ctx)
}

// getReportsForStaffComposed - API Composition Pattern
// 1. Query Report local (no JOIN)
// 2. Batch fetch user names via Auth API
// 3. Batch fetch ticket status + category via Ticket API
func (r *StaffRepository) getReportsForStaffComposed(ctx context.Context) ([]models.ReportListResponse, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 GetReportsForStaff via API Composition")

	// 1) Query Report basic info (local only)
	query := `
		SELECT r.report_id, r.user_id, r.ticket_id, r.title, r.description, r.image_url, r.created_at, r.status
		FROM Report r
		ORDER BY r.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query reports: %w", err)
	}
	defer rows.Close()

	type reportRow struct {
		Report   models.ReportListResponse
		UserID   int
		TicketID int
	}
	var reportRows []reportRow
	for rows.Next() {
		var rr reportRow
		var createdAt time.Time
		var imageURL sql.NullString

		err := rows.Scan(
			&rr.Report.ReportID, &rr.UserID, &rr.TicketID,
			&rr.Report.Title, &rr.Report.Description, &imageURL,
			&createdAt, &rr.Report.ReportStatus,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan report: %w", err)
		}
		rr.Report.TicketID = rr.TicketID
		rr.Report.CreatedAt = createdAt.Format(time.RFC3339)
		if imageURL.Valid {
			rr.Report.ImageURL = &imageURL.String
		}
		reportRows = append(reportRows, rr)
	}

	client := utils.NewInternalClient()
	ctx = utils.WithRequestHeaders(ctx, map[string]string{"X-Internal-Call": "true"})

	// 2) Enrich each report with user + ticket info
	for i := range reportRows {
		rr := &reportRows[i]

		// Auth: get user name
		authURL := utils.GetAuthServiceURL()
		type userResp struct {
			FullName string `json:"fullName"`
		}
		var profile userResp
		sc, err := client.GetJSON(ctx, authURL+"/internal/user/profile",
			map[string]string{"userId": strconv.Itoa(rr.UserID)}, &profile)
		if err == nil && sc == http.StatusOK {
			rr.Report.StudentName = profile.FullName
		} else {
			// Fallback local
			r.db.QueryRowContext(ctx, "SELECT COALESCE(full_name, 'Khách hàng') FROM Users WHERE user_id = ?", rr.UserID).Scan(&rr.Report.StudentName)
		}

		// Ticket: get status + category info
		ticketURL := utils.GetTicketServiceURL()
		type ticketResp struct {
			Status       string  `json:"status"`
			CategoryName string  `json:"categoryName"`
			Price        float64 `json:"price"`
		}
		var tInfo ticketResp
		sc2, err2 := client.GetJSON(ctx, ticketURL+"/internal/ticket/info",
			map[string]string{"ticketId": strconv.Itoa(rr.TicketID)}, &tInfo)
		if err2 == nil && sc2 == http.StatusOK {
			rr.Report.TicketStatus = tInfo.Status
			catName := tInfo.CategoryName
			rr.Report.CategoryTicketName = &catName
			rr.Report.Price = tInfo.Price
		} else {
			// Fallback local
			var catName sql.NullString
			r.db.QueryRowContext(ctx,
				`SELECT t.status, ct.name, ct.price FROM Ticket t
				 JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
				 WHERE t.ticket_id = ?`, rr.TicketID,
			).Scan(&rr.Report.TicketStatus, &catName, &rr.Report.Price)
			if catName.Valid {
				rr.Report.CategoryTicketName = &catName.String
			}
		}
	}

	var reports []models.ReportListResponse
	for _, rr := range reportRows {
		reports = append(reports, rr.Report)
	}

	log.Info("[API_COMPOSITION] ✅ GetReportsForStaff composed: count=%d", len(reports))
	return reports, nil
}

// getReportsForStaffJoin - Logic cũ (monolith JOIN)
func (r *StaffRepository) getReportsForStaffJoin(ctx context.Context) ([]models.ReportListResponse, error) {
	query := `
		SELECT 
			r.report_id,
			r.ticket_id,
			r.title,
			r.description,
			r.image_url,
			r.created_at,
			r.status AS report_status,
			u.full_name AS student_name,
			t.status AS ticket_status,
			ct.name AS category_ticket_name,
			ct.price
		FROM Report r
		JOIN Users u ON u.user_id = r.user_id
		JOIN Ticket t ON t.ticket_id = r.ticket_id
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		ORDER BY r.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query reports: %w", err)
	}
	defer rows.Close()

	var reports []models.ReportListResponse
	for rows.Next() {
		var report models.ReportListResponse
		var createdAt time.Time

		err := rows.Scan(
			&report.ReportID,
			&report.TicketID,
			&report.Title,
			&report.Description,
			&report.ImageURL,
			&createdAt,
			&report.ReportStatus,
			&report.StudentName,
			&report.TicketStatus,
			&report.CategoryTicketName,
			&report.Price,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan report: %w", err)
		}

		report.CreatedAt = createdAt.Format(time.RFC3339)
		reports = append(reports, report)
	}

	return reports, nil
}

// ============================================================
// GetReportDetailForStaff - Lấy chi tiết report cho staff
// KHỚP VỚI Java ReportDAO.getReportDetailForStaff()
// ⭐ Phase 5: Khi TICKET_API_ENABLED + AUTH_API_ENABLED → API Composition
// ============================================================
func (r *StaffRepository) GetReportDetailForStaff(ctx context.Context, reportID int) (*models.ReportDetailResponse, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) && config.IsFeatureEnabled(config.FlagAuthAPIEnabled) {
		return r.getReportDetailForStaffComposed(ctx, reportID)
	}
	return r.getReportDetailForStaffJoin(ctx, reportID)
}

// getReportDetailForStaffComposed - API Composition Pattern
func (r *StaffRepository) getReportDetailForStaffComposed(ctx context.Context, reportID int) (*models.ReportDetailResponse, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 GetReportDetailForStaff via API: reportID=%d", reportID)

	// 1) Query Report basic info (local)
	var report models.ReportDetailResponse
	var createdAt time.Time
	var userID, ticketID int
	var imageURL sql.NullString

	localQuery := `SELECT report_id, user_id, ticket_id, title, description, image_url, created_at, status FROM Report WHERE report_id = ?`
	err := r.db.QueryRowContext(ctx, localQuery, reportID).Scan(
		&report.ReportID, &userID, &ticketID,
		&report.Title, &report.Description, &imageURL,
		&createdAt, &report.ReportStatus,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get report: %w", err)
	}
	report.TicketID = ticketID
	report.StudentID = userID
	report.CreatedAt = createdAt.Format(time.RFC3339)
	if imageURL.Valid {
		report.ImageURL = &imageURL.String
	}

	client := utils.NewInternalClient()
	ctx = utils.WithRequestHeaders(ctx, map[string]string{"X-Internal-Call": "true"})

	// 2) Auth Service → student name
	authURL := utils.GetAuthServiceURL()
	type userResp struct {
		FullName string `json:"fullName"`
	}
	var profile userResp
	sc, err := client.GetJSON(ctx, authURL+"/internal/user/profile",
		map[string]string{"userId": strconv.Itoa(userID)}, &profile)
	if err == nil && sc == http.StatusOK {
		report.StudentName = profile.FullName
	} else {
		r.db.QueryRowContext(ctx, "SELECT COALESCE(full_name, 'Khách hàng') FROM Users WHERE user_id = ?", userID).Scan(&report.StudentName)
	}

	// 3) Ticket Service → ticket status + category + seat
	ticketURL := utils.GetTicketServiceURL()
	type ticketResp struct {
		Status           string  `json:"status"`
		CategoryTicketID int     `json:"categoryTicketId"`
		SeatID           *int    `json:"seatId,omitempty"`
		CategoryName     string  `json:"categoryName"`
		Price            float64 `json:"price"`
	}
	var tInfo ticketResp
	sc2, err2 := client.GetJSON(ctx, ticketURL+"/internal/ticket/info",
		map[string]string{"ticketId": strconv.Itoa(ticketID)}, &tInfo)
	if err2 == nil && sc2 == http.StatusOK {
		report.TicketStatus = tInfo.Status
		report.CategoryTicketID = tInfo.CategoryTicketID
		catName := tInfo.CategoryName
		report.CategoryTicketName = &catName
		report.Price = tInfo.Price
		report.SeatID = tInfo.SeatID
	} else {
		// Fallback local
		var seatID sql.NullInt64
		var catName sql.NullString
		r.db.QueryRowContext(ctx,
			`SELECT t.status, t.category_ticket_id, t.seat_id, ct.name, ct.price
			 FROM Ticket t JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
			 WHERE t.ticket_id = ?`, ticketID,
		).Scan(&report.TicketStatus, &report.CategoryTicketID, &seatID, &catName, &report.Price)
		if catName.Valid {
			report.CategoryTicketName = &catName.String
		}
		if seatID.Valid {
			val := int(seatID.Int64)
			report.SeatID = &val
		}
	}

	// 4) Venue Service → seat + area + venue (nếu có seatId)
	if report.SeatID != nil {
		var seatCode, rowNo sql.NullString
		var colNo, areaID, floorVal, venueID sql.NullInt64
		var areaName, venueName, location sql.NullString
		r.db.QueryRowContext(ctx,
			`SELECT s.seat_code, s.row_no, s.col_no,
			        va.area_id, va.area_name, va.floor,
			        v.venue_id, v.venue_name, v.location
			 FROM Seat s
			 LEFT JOIN Venue_Area va ON va.area_id = s.area_id
			 LEFT JOIN Venue v ON v.venue_id = va.venue_id
			 WHERE s.seat_id = ?`, *report.SeatID,
		).Scan(&seatCode, &rowNo, &colNo, &areaID, &areaName, &floorVal, &venueID, &venueName, &location)
		if seatCode.Valid {
			report.SeatCode = &seatCode.String
		}
		if rowNo.Valid {
			report.RowNo = &rowNo.String
		}
		if colNo.Valid {
			v := int(colNo.Int64)
			report.ColNo = &v
		}
		if areaID.Valid {
			v := int(areaID.Int64)
			report.AreaID = &v
		}
		if areaName.Valid {
			report.AreaName = &areaName.String
		}
		if floorVal.Valid {
			v := int(floorVal.Int64)
			report.Floor = &v
		}
		if venueID.Valid {
			v := int(venueID.Int64)
			report.VenueID = &v
		}
		if venueName.Valid {
			report.VenueName = &venueName.String
		}
		if location.Valid {
			report.Location = &location.String
		}
	}

	log.Info("[API_COMPOSITION] ✅ GetReportDetailForStaff composed: reportID=%d", reportID)
	return &report, nil
}

// getReportDetailForStaffJoin - Logic cũ (monolith 7-table JOIN)
func (r *StaffRepository) getReportDetailForStaffJoin(ctx context.Context, reportID int) (*models.ReportDetailResponse, error) {
	query := `
		SELECT 
			r.report_id,
			r.ticket_id,
			r.title,
			r.description,
			r.image_url,
			r.created_at,
			r.status AS report_status,
			u.user_id AS student_id,
			u.full_name AS student_name,
			t.status AS ticket_status,
			t.category_ticket_id,
			t.seat_id,
			ct.name AS category_ticket_name,
			ct.price,
			s.seat_code,
			s.row_no,
			s.col_no,
			va.area_id,
			va.area_name,
			va.floor,
			v.venue_id,
			v.venue_name,
			v.location
		FROM Report r
		JOIN Users u ON u.user_id = r.user_id
		JOIN Ticket t ON t.ticket_id = r.ticket_id
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		LEFT JOIN Seat s ON s.seat_id = t.seat_id
		LEFT JOIN Venue_Area va ON va.area_id = s.area_id
		LEFT JOIN Venue v ON v.venue_id = va.venue_id
		WHERE r.report_id = ?
	`

	var report models.ReportDetailResponse
	var createdAt time.Time

	err := r.db.QueryRowContext(ctx, query, reportID).Scan(
		&report.ReportID,
		&report.TicketID,
		&report.Title,
		&report.Description,
		&report.ImageURL,
		&createdAt,
		&report.ReportStatus,
		&report.StudentID,
		&report.StudentName,
		&report.TicketStatus,
		&report.CategoryTicketID,
		&report.SeatID,
		&report.CategoryTicketName,
		&report.Price,
		&report.SeatCode,
		&report.RowNo,
		&report.ColNo,
		&report.AreaID,
		&report.AreaName,
		&report.Floor,
		&report.VenueID,
		&report.VenueName,
		&report.Location,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get report detail: %w", err)
	}

	report.CreatedAt = createdAt.Format(time.RFC3339)
	return &report, nil
}

// ============================================================
// UpdateSystemConfig - Cập nhật config hệ thống
// KHỚP VỚI Java SystemConfigService.updateConfig()
// ============================================================
func (r *StaffRepository) UpdateSystemConfig(ctx context.Context, key, value string) error {
	// Check if config exists
	var count int
	checkQuery := `SELECT COUNT(*) FROM System_Config WHERE config_key = ?`
	err := r.db.QueryRowContext(ctx, checkQuery, key).Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check config: %w", err)
	}

	if count > 0 {
		// Update existing config
		updateQuery := `UPDATE System_Config SET config_value = ? WHERE config_key = ?`
		_, err = r.db.ExecContext(ctx, updateQuery, value, key)
		if err != nil {
			return fmt.Errorf("failed to update config: %w", err)
		}
	} else {
		// Insert new config
		insertQuery := `INSERT INTO System_Config (config_key, config_value) VALUES (?, ?)`
		_, err = r.db.ExecContext(ctx, insertQuery, key, value)
		if err != nil {
			return fmt.Errorf("failed to insert config: %w", err)
		}
	}

	return nil
}

// ============================================================
// GetTicketIDByQRCode - Lấy ticketId từ QR code value
// Hỗ trợ format Go backend: TKT_eventId_seatId_billId
// ============================================================
func (r *StaffRepository) GetTicketIDByQRCode(ctx context.Context, qrCodeValue string) (int, error) {
	query := `SELECT ticket_id FROM Ticket WHERE qr_code_value = ? LIMIT 1`

	var ticketID int
	err := r.db.QueryRowContext(ctx, query, qrCodeValue).Scan(&ticketID)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return 0, fmt.Errorf("failed to get ticket by qr code: %w", err)
	}

	return ticketID, nil
}

// ============================================================
// ✅ VerifyEventOwnership - Kiểm tra quyền sở hữu sự kiện
// Chỉ cho phép Organizer quét vé của sự kiện họ tạo
// ============================================================
func (r *StaffRepository) VerifyEventOwnership(ctx context.Context, userID int, eventID int) (bool, error) {
	query := `
		SELECT COUNT(*) 
		FROM Event_Request 
		WHERE created_event_id = ? AND requester_id = ?
	`

	var count int
	err := r.db.QueryRowContext(ctx, query, eventID, userID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to verify event ownership: %w", err)
	}

	return count > 0, nil
}
