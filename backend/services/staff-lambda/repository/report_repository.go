package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/models"
)

// ReportRepository handles report/refund database operations
type ReportRepository struct {
	db *sql.DB
}

// NewReportRepository creates a new report repository
func NewReportRepository() *ReportRepository {
	return &ReportRepository{
		db: db.GetDB(),
	}
}

// ============================================================
// GetReportDetailForStaff - Lấy chi tiết report cho staff
// KHỚP VỚI Java ReportDAO.getReportDetailForStaff
// ============================================================
func (r *ReportRepository) GetReportDetailForStaff(ctx context.Context, reportID int) (*models.ReportDetailStaffDTO, error) {
	log := logger.Default().WithContext(ctx)

	query := `
		SELECT 
			r.report_id, r.ticket_id, r.title, r.description, r.image_url, r.created_at, r.status AS report_status,
			u.user_id AS student_id, u.full_name AS student_name,
			t.status AS ticket_status, t.category_ticket_id, t.seat_id,
			ct.name AS category_ticket_name, ct.price,
			s.seat_code, s.row_no, s.col_no,
			va.area_id, va.area_name, va.floor,
			v.venue_id, v.venue_name, v.location
		FROM Report r
		JOIN Users u ON u.user_id = r.user_id
		JOIN Ticket t ON t.ticket_id = r.ticket_id
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		LEFT JOIN Seat s ON s.seat_id = t.seat_id
		LEFT JOIN Venue_Area va ON va.area_id = s.area_id
		LEFT JOIN Venue v ON v.venue_id = va.venue_id
		WHERE r.report_id = ?
	`

	dto := &models.ReportDetailStaffDTO{}
	var (
		imageURL  sql.NullString
		seatID    sql.NullInt64
		seatCode  sql.NullString
		rowNo     sql.NullString
		colNo     sql.NullInt64
		areaID    sql.NullInt64
		areaName  sql.NullString
		floor     sql.NullInt64
		venueID   sql.NullInt64
		venueName sql.NullString
		location  sql.NullString
	)

	err := r.db.QueryRowContext(ctx, query, reportID).Scan(
		&dto.ReportID,
		&dto.TicketID,
		&dto.Title,
		&dto.Description,
		&imageURL,
		&dto.CreatedAt,
		&dto.ReportStatus,
		&dto.StudentID,
		&dto.StudentName,
		&dto.TicketStatus,
		&dto.CategoryTicketID,
		&seatID,
		&dto.CategoryTicketName,
		&dto.Price,
		&seatCode,
		&rowNo,
		&colNo,
		&areaID,
		&areaName,
		&floor,
		&venueID,
		&venueName,
		&location,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Info("Report not found", "reportID", reportID)
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get report detail: %w", err)
	}

	// Map nullable fields
	if imageURL.Valid {
		dto.ImageURL = &imageURL.String
	}
	if seatID.Valid {
		val := int(seatID.Int64)
		dto.SeatID = &val
	}
	if seatCode.Valid {
		dto.SeatCode = &seatCode.String
	}
	if rowNo.Valid {
		dto.RowNo = &rowNo.String
	}
	if colNo.Valid {
		val := int(colNo.Int64)
		dto.ColNo = &val
	}
	if areaID.Valid {
		val := int(areaID.Int64)
		dto.AreaID = &val
	}
	if areaName.Valid {
		dto.AreaName = &areaName.String
	}
	if floor.Valid {
		val := int(floor.Int64)
		dto.Floor = &val
	}
	if venueID.Valid {
		val := int(venueID.Int64)
		dto.VenueID = &val
	}
	if venueName.Valid {
		dto.VenueName = &venueName.String
	}
	if location.Valid {
		dto.Location = &location.String
	}

	return dto, nil
}

// ============================================================
// ListReportsForStaff - List reports với pagination & filter
// KHỚP VỚI Java ReportDAO.listReportsForStaff
// ============================================================
func (r *ReportRepository) ListReportsForStaff(ctx context.Context, status string, page, pageSize int) ([]models.ReportListStaffDTO, error) {
	log := logger.Default().WithContext(ctx)

	// Safety checks
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize

	query := `
		SELECT 
			r.report_id, r.ticket_id, r.title, r.description, r.image_url, r.created_at, r.status AS report_status,
			u.full_name AS student_name,
			t.status AS ticket_status,
			ct.name AS category_ticket_name, ct.price
		FROM Report r
		JOIN Users u ON u.user_id = r.user_id
		JOIN Ticket t ON t.ticket_id = r.ticket_id
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
	`

	args := []interface{}{}
	if status != "" {
		query += " WHERE r.status = ?"
		args = append(args, status)
	}

	query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, pageSize, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list reports: %w", err)
	}
	defer rows.Close()

	list := []models.ReportListStaffDTO{}
	for rows.Next() {
		dto := models.ReportListStaffDTO{}
		var imageURL sql.NullString

		err := rows.Scan(
			&dto.ReportID,
			&dto.TicketID,
			&dto.Title,
			&dto.Description,
			&imageURL,
			&dto.CreatedAt,
			&dto.ReportStatus,
			&dto.StudentName,
			&dto.TicketStatus,
			&dto.CategoryTicketName,
			&dto.Price,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan report row: %w", err)
		}

		if imageURL.Valid {
			dto.ImageURL = &imageURL.String
		}

		list = append(list, dto)
	}

	log.Info("Listed reports for staff", "status", status, "page", page, "count", len(list))
	return list, nil
}

// ============================================================
// ProcessReport - APPROVE/REJECT report với transaction
// KHỚP VỚI Java ReportDAO.processReport
// ⭐ Key Points:
// 1. Lock report row (FOR UPDATE) để tránh race-condition
// 2. Validate report status = PENDING
// 3. Nếu APPROVE: validate ticket CHECKED_IN → refund → update wallet/ticket/report
// 4. Nếu REJECT: chỉ update report status
// 5. Transaction rollback nếu bất kỳ step nào fail
// ============================================================
type ProcessReportResult struct {
	Success      bool
	Message      string
	RefundAmount *float64
}

func (r *ReportRepository) ProcessReport(ctx context.Context, reportID, staffID int, approve bool, staffNote *string) (*ProcessReportResult, error) {
	log := logger.Default().WithContext(ctx)
	result := &ProcessReportResult{
		Success: false,
		Message: "Unknown error",
	}

	// Begin transaction
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		if !result.Success {
			tx.Rollback()
		}
	}()

	// 1) Lock report row để chống race-condition (2 staff bấm cùng lúc)
	var userID, ticketID int
	var reportStatus string

	query := `
		SELECT user_id, ticket_id, status
		FROM Report
		WHERE report_id = ?
		FOR UPDATE
	`
	err = tx.QueryRowContext(ctx, query, reportID).Scan(&userID, &ticketID, &reportStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			result.Message = "Không tìm thấy report"
			return result, nil
		}
		return nil, fmt.Errorf("failed to lock report: %w", err)
	}

	if reportStatus != "PENDING" {
		result.Message = "Report này đã được xử lý rồi"
		return result, nil
	}

	// 2) Nếu REJECT → chỉ update report (không cần validate CHECKED_IN)
	if !approve {
		query := `
			UPDATE Report
			SET status = 'REJECTED', processed_by = ?, processed_at = UTC_TIMESTAMP(), staff_note = ?
			WHERE report_id = ? AND status = 'PENDING'
		`
		res, err := tx.ExecContext(ctx, query, staffID, staffNote, reportID)
		if err != nil {
			return nil, fmt.Errorf("failed to reject report: %w", err)
		}

		rows, _ := res.RowsAffected()
		if rows <= 0 {
			result.Message = "Không thể từ chối (report không còn PENDING)"
			return result, nil
		}

		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("failed to commit reject: %w", err)
		}

		result.Success = true
		result.Message = "Đã từ chối report"
		log.Info("Report rejected", "reportID", reportID, "staffID", staffID)
		return result, nil
	}

	// 3) APPROVE: Validate ticket phải CHECKED_IN
	var ticketStatus string
	query = `
		SELECT status
		FROM Ticket
		WHERE ticket_id = ?
		FOR UPDATE
	`
	err = tx.QueryRowContext(ctx, query, ticketID).Scan(&ticketStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			result.Message = "Không tìm thấy ticket"
			return result, nil
		}
		return nil, fmt.Errorf("failed to lock ticket: %w", err)
	}

	if ticketStatus != "CHECKED_IN" {
		result.Message = "Chỉ hoàn tiền cho vé đã CHECKED_IN"
		return result, nil
	}

	// 4) Tính refund amount theo Category_Ticket.price (⭐ GIÁ VÉ GỐC)
	var refund float64
	query = `
		SELECT ct.price
		FROM Ticket t
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		WHERE t.ticket_id = ?
	`
	err = tx.QueryRowContext(ctx, query, ticketID).Scan(&refund)
	if err != nil {
		if err == sql.ErrNoRows {
			result.Message = "Không tìm thấy ticket/category_ticket để tính tiền hoàn"
			return result, nil
		}
		return nil, fmt.Errorf("failed to get refund amount: %w", err)
	}

	// 5) Update Users.Wallet += refund
	query = `
		UPDATE Users
		SET Wallet = Wallet + ?
		WHERE user_id = ?
	`
	res, err := tx.ExecContext(ctx, query, refund, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to update wallet: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows <= 0 {
		result.Message = "Không cập nhật được Wallet"
		return result, nil
	}

	// 6) Update Ticket.status = REFUNDED (chỉ update nếu đang CHECKED_IN)
	query = `
		UPDATE Ticket
		SET status = 'REFUNDED'
		WHERE ticket_id = ? AND status = 'CHECKED_IN'
	`
	res, err = tx.ExecContext(ctx, query, ticketID)
	if err != nil {
		return nil, fmt.Errorf("failed to update ticket status: %w", err)
	}
	rows, _ = res.RowsAffected()
	if rows <= 0 {
		result.Message = "Không cập nhật được trạng thái ticket (ticket không còn CHECKED_IN)"
		return result, nil
	}

	// 7) Update Report status APPROVED + processed info + refund_amount + staff_note
	query = `
		UPDATE Report
		SET status = 'APPROVED', processed_by = ?, processed_at = UTC_TIMESTAMP(), refund_amount = ?, staff_note = ?
		WHERE report_id = ? AND status = 'PENDING'
	`
	res, err = tx.ExecContext(ctx, query, staffID, refund, staffNote, reportID)
	if err != nil {
		return nil, fmt.Errorf("failed to approve report: %w", err)
	}
	rows, _ = res.RowsAffected()
	if rows <= 0 {
		result.Message = "Không thể approve (report không còn PENDING)"
		return result, nil
	}

	// 8) Commit transaction
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit approve: %w", err)
	}

	result.Success = true
	result.RefundAmount = &refund
	result.Message = "Đã duyệt và hoàn tiền thành công"

	log.Info("Report approved and refunded",
		"reportID", reportID,
		"staffID", staffID,
		"ticketID", ticketID,
		"userID", userID,
		"refundAmount", refund,
	)

	return result, nil
}
