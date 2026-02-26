package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/services/staff-lambda/models"
)

// StaffRepository handles staff-related database operations
type StaffRepository struct {
	db *sql.DB
}

// NewStaffRepository creates a new staff repository
func NewStaffRepository() *StaffRepository {
	return &StaffRepository{
		db: db.GetDB(),
	}
}

// ============================================================
// GetTicketForCheckin - Lấy thông tin vé cho check-in
// KHỚP VỚI Java TicketDAO
// ============================================================
func (r *StaffRepository) GetTicketForCheckin(ctx context.Context, ticketID int) (*models.TicketForCheckin, error) {
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
// Sử dụng optimistic locking: chỉ update nếu status = 'BOOKED'
// ============================================================
func (r *StaffRepository) UpdateTicketCheckin(ctx context.Context, ticketID int) (int64, error) {
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
// Sử dụng optimistic locking: chỉ update nếu status = 'CHECKED_IN'
// ============================================================
func (r *StaffRepository) UpdateTicketCheckout(ctx context.Context, ticketID int) (int64, error) {
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
// ============================================================
func (r *StaffRepository) GetReportsForStaff(ctx context.Context) ([]models.ReportListResponse, error) {
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
// ============================================================
func (r *StaffRepository) GetReportDetailForStaff(ctx context.Context, reportID int) (*models.ReportDetailResponse, error) {
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
