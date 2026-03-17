package repository

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/models"
	"github.com/fpt-event-services/common/utils"
)

// ReportRepository handles report/refund database operations
type ReportRepository struct {
	db *sql.DB
}

// NewReportRepositoryWithDB creates a new report repository with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton db.GetDB() allowed
func NewReportRepositoryWithDB(dbConn *sql.DB) *ReportRepository {
	return &ReportRepository{
		db: dbConn,
	}
}

// ============================================================
// GetReportDetailForStaff - Lấy chi tiết report cho staff
// KHỚP VỚI Java ReportDAO.getReportDetailForStaff
// ⭐ Phase 5: Khi TICKET_API_ENABLED + AUTH_API_ENABLED → API Composition
//
//	thay thế 7 JOINs chéo domain
//
// ============================================================
func (r *ReportRepository) GetReportDetailForStaff(ctx context.Context, reportID int) (*models.ReportDetailStaffDTO, error) {
	// ✅ Feature Flag: Chọn API Composition hoặc SQL JOIN
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) && config.IsFeatureEnabled(config.FlagAuthAPIEnabled) {
		return r.getReportDetailComposed(ctx, reportID)
	}
	return r.getReportDetailJoin(ctx, reportID)
}

// ============================================================
// getReportDetailComposed - API Composition Pattern (Phase 5)
//
// 1. Query Report table (local, no JOIN)
// 2. Gọi /internal/user/profile → student info
// 3. Gọi /internal/ticket/info → ticket + category info
// 4. Gọi /internal/venue/seat/info → seat info (nếu có seatId)
// 5. Gọi /internal/venue/area/by-seat → area + venue info (nếu có seatId)
// ============================================================
func (r *ReportRepository) getReportDetailComposed(ctx context.Context, reportID int) (*models.ReportDetailStaffDTO, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("[API_COMPOSITION] 🔄 GetReportDetail via API Composition: reportID=%d", reportID)

	// 1) Query Report basic info (local, Report table only)
	var dto models.ReportDetailStaffDTO
	var imageURL sql.NullString
	var userID int
	var processedBy sql.NullInt64
	var processedAt sql.NullTime
	var staffNote sql.NullString

	query := `
		SELECT report_id, user_id, ticket_id, title, description, image_url, created_at, status, processed_by, processed_at, staff_note
		FROM Report
		WHERE report_id = ?
	`
	err := r.db.QueryRowContext(ctx, query, reportID).Scan(
		&dto.ReportID, &userID, &dto.TicketID, &dto.Title, &dto.Description,
		&imageURL, &dto.CreatedAt, &dto.ReportStatus, &processedBy, &processedAt, &staffNote,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Info("Report not found", "reportID", reportID)
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get report: %w", err)
	}
	if imageURL.Valid {
		dto.ImageURL = &imageURL.String
	}
	if processedAt.Valid {
		dto.ProcessedAt = &processedAt.Time
	}
	if staffNote.Valid {
		dto.StaffNote = &staffNote.String
	}
	// Lấy tên staff từ processed_by (user_id)
	if processedBy.Valid {
		var staffName string
		staffErr := r.db.QueryRowContext(ctx, "SELECT COALESCE(full_name, 'Staff') FROM Users WHERE user_id = ?", processedBy.Int64).Scan(&staffName)
		if staffErr == nil {
			dto.ProcessedBy = &staffName
		}
	}
	dto.StudentID = userID

	client := utils.NewInternalClient()

	// Inject internal call header vào context
	ctx = utils.WithRequestHeaders(ctx, map[string]string{
		"X-Internal-Token": utils.GetInternalAuthToken(),
	})

	// 2) Gọi Auth Service → student info
	authURL := utils.GetAuthServiceURL()
	type userProfileResp struct {
		UserID   int    `json:"userId"`
		FullName string `json:"fullName"`
		Email    string `json:"email"`
	}
	var profile userProfileResp
	profileStatusCode, profileErr := client.GetJSON(ctx, authURL+"/internal/user/profile",
		map[string]string{"userId": strconv.Itoa(userID)}, &profile)
	if profileErr == nil && profileStatusCode == http.StatusOK {
		dto.StudentName = profile.FullName
	} else {
		// Fallback: query local
		log.Info("[API_COMPOSITION] ⚠️ Auth API failed, falling back to local for user %d", userID)
		r.db.QueryRowContext(ctx, "SELECT COALESCE(full_name, 'Khách hàng') FROM Users WHERE user_id = ?", userID).Scan(&dto.StudentName)
	}

	// 3) Gọi Ticket Service → ticket + category info
	ticketURL := utils.GetTicketServiceURL()
	type ticketInfoResp struct {
		TicketID         int     `json:"ticketId"`
		Status           string  `json:"status"`
		CategoryTicketID int     `json:"categoryTicketId"`
		SeatID           *int    `json:"seatId"`
		CategoryName     string  `json:"categoryName"`
		Price            float64 `json:"price"`
	}
	var ticketInfo ticketInfoResp
	ticketStatusCode, ticketErr := client.GetJSON(ctx, ticketURL+"/internal/ticket/info",
		map[string]string{"ticketId": strconv.Itoa(dto.TicketID)}, &ticketInfo)
	if ticketErr == nil && ticketStatusCode == http.StatusOK {
		dto.TicketStatus = ticketInfo.Status
		dto.CategoryTicketID = ticketInfo.CategoryTicketID
		dto.CategoryTicketName = ticketInfo.CategoryName
		dto.Price = ticketInfo.Price
		if ticketInfo.SeatID != nil {
			dto.SeatID = ticketInfo.SeatID
		}
	} else {
		// Fallback: query local
		log.Info("[API_COMPOSITION] ⚠️ Ticket API failed, falling back to local for ticket %d", dto.TicketID)
		var seatID sql.NullInt64
		r.db.QueryRowContext(ctx,
			`SELECT t.status, t.category_ticket_id, t.seat_id, ct.name, ct.price
			 FROM Ticket t JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
			 WHERE t.ticket_id = ?`, dto.TicketID,
		).Scan(&dto.TicketStatus, &dto.CategoryTicketID, &seatID, &dto.CategoryTicketName, &dto.Price)
		if seatID.Valid {
			val := int(seatID.Int64)
			dto.SeatID = &val
		}
	}

	// 4) Gọi Venue Service → seat + area + venue info (nếu có seatId)
	if dto.SeatID != nil && config.IsFeatureEnabled(config.FlagVenueAPIEnabled) {
		venueURL := utils.GetVenueServiceURL()
		seatID := *dto.SeatID

		// 4a) GỌI area/by-seat TRƯỚC để lấy areaId (bắt buộc cho seat/info)
		// VenueArea.Floor là *string → dùng *string ở đây
		type areaBySeatResp struct {
			AreaID   int     `json:"areaId"`
			VenueID  int     `json:"venueId"`
			AreaName string  `json:"areaName"`
			Floor    *string `json:"floor"` // *string theo VenueArea model
		}
		var areaInfo areaBySeatResp
		areaStatusCode, areaErr := client.GetJSON(ctx, venueURL+"/internal/venue/area/by-seat",
			map[string]string{"seatId": strconv.Itoa(seatID)}, &areaInfo)
		if areaErr != nil || areaStatusCode != http.StatusOK {
			log.Info("[API_COMPOSITION] ⚠️ area/by-seat failed: status=%d, err=%v", areaStatusCode, areaErr)
		} else {
			// Gán area info
			areaIDVal := areaInfo.AreaID
			dto.AreaID = &areaIDVal
			dto.AreaName = &areaInfo.AreaName
			// Chuyển floor từ *string sang *int
			if areaInfo.Floor != nil {
				if floorInt, convErr := strconv.Atoi(*areaInfo.Floor); convErr == nil {
					dto.Floor = &floorInt
				}
			}
			venueIDVal := areaInfo.VenueID
			dto.VenueID = &venueIDVal

			// 4b) Gọi seat/info với CẢ HAI tham số seatId VÀ areaId (bắt buộc)
			// Seat model trả về: seatCode, row/seatRow, column/seatColumn
			type seatInfoResp struct {
				SeatID     int     `json:"seatId"`
				AreaID     int     `json:"areaId"`
				SeatCode   string  `json:"seatCode"`
				SeatRow    *string `json:"seatRow"`    // field chính của Seat model
				Row        *string `json:"row"`        // fallback
				SeatColumn *int    `json:"seatColumn"` // field chính của Seat model
				Column     *int    `json:"column"`     // fallback
			}
			var seatInfo seatInfoResp
			seatStatusCode, seatErr := client.GetJSON(ctx, venueURL+"/internal/venue/seat/info",
				map[string]string{
					"seatId": strconv.Itoa(seatID),
					"areaId": strconv.Itoa(areaInfo.AreaID), // truyền areaId lấy từ bước 4a
				}, &seatInfo)
			if seatErr == nil && seatStatusCode == http.StatusOK {
				dto.SeatCode = &seatInfo.SeatCode
				// Ưu tiên SeatRow, fallback sang Row
				if seatInfo.SeatRow != nil {
					dto.RowNo = seatInfo.SeatRow
				} else if seatInfo.Row != nil {
					dto.RowNo = seatInfo.Row
				}
				// Ưu tiên SeatColumn, fallback sang Column
				if seatInfo.SeatColumn != nil {
					dto.ColNo = seatInfo.SeatColumn
				} else if seatInfo.Column != nil {
					dto.ColNo = seatInfo.Column
				}
				log.Info("[API_COMPOSITION] ✅ seat/info OK: seatCode=%s, row=%v, col=%v",
					seatInfo.SeatCode, dto.RowNo, dto.ColNo)
			} else {
				log.Info("[API_COMPOSITION] ⚠️ seat/info failed: status=%d, err=%v", seatStatusCode, seatErr)
			}

			// 4c) Gọi venue/info để lấy venueName + location
			type venueInfoResp struct {
				VenueID   int    `json:"venueId"`
				VenueName string `json:"venueName"`
				Location  string `json:"location"`
			}
			var venueInfo venueInfoResp
			venueStatusCode, venueErr := client.GetJSON(ctx, venueURL+"/internal/venue/info",
				map[string]string{"venueId": strconv.Itoa(areaInfo.VenueID)}, &venueInfo)
			if venueErr == nil && venueStatusCode == http.StatusOK {
				dto.VenueName = &venueInfo.VenueName
				if venueInfo.Location != "" {
					dto.Location = &venueInfo.Location
				}
				log.Info("[API_COMPOSITION] ✅ venue/info OK: venueName=%s", venueInfo.VenueName)
			} else {
				log.Info("[API_COMPOSITION] ⚠️ venue/info failed: status=%d, err=%v", venueStatusCode, venueErr)
			}
		}
	} else if dto.SeatID != nil {
		// Venue API not enabled → fallback to local JOIN for seat/area/venue
		var (
			seatCode  sql.NullString
			rowNo     sql.NullString
			colNo     sql.NullInt64
			areaID    sql.NullInt64
			areaName  sql.NullString
			floorVal  sql.NullInt64
			venueID   sql.NullInt64
			venueName sql.NullString
			location  sql.NullString
		)
		r.db.QueryRowContext(ctx,
			`SELECT s.seat_code, s.row_no, s.col_no, va.area_id, va.area_name, va.floor, v.venue_id, v.venue_name, v.location
			 FROM Seat s
			 LEFT JOIN Venue_Area va ON va.area_id = s.area_id
			 LEFT JOIN Venue v ON v.venue_id = va.venue_id
			 WHERE s.seat_id = ?`, *dto.SeatID,
		).Scan(&seatCode, &rowNo, &colNo, &areaID, &areaName, &floorVal, &venueID, &venueName, &location)

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
		if floorVal.Valid {
			val := int(floorVal.Int64)
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
	}

	log.Info("[API_COMPOSITION] ✅ GetReportDetail composed: reportID=%d, student=%s, ticket=%s",
		reportID, dto.StudentName, dto.TicketStatus)
	return &dto, nil
}

// ============================================================
// getReportDetailJoin - Logic cũ (monolith 7-table JOIN)
// Giữ nguyên khi TICKET_API_ENABLED=false || AUTH_API_ENABLED=false
// ============================================================
func (r *ReportRepository) getReportDetailJoin(ctx context.Context, reportID int) (*models.ReportDetailStaffDTO, error) {
	log := logger.Default().WithContext(ctx)

	query := `
		SELECT 
			r.report_id, r.ticket_id, r.title, r.description, r.image_url, r.created_at, r.status AS report_status,
			u.user_id AS student_id, u.full_name AS student_name,
			t.status AS ticket_status, t.category_ticket_id, t.seat_id,
			ct.name AS category_ticket_name, ct.price,
			s.seat_code, s.row_no, s.col_no,
			va.area_id, va.area_name, va.floor,
			v.venue_id, v.venue_name, v.location,
			r.processed_by, r.processed_at, r.staff_note, u2.full_name AS processed_by_name
		FROM Report r
		JOIN Users u ON u.user_id = r.user_id
		JOIN Ticket t ON t.ticket_id = r.ticket_id
		JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
		LEFT JOIN Seat s ON s.seat_id = t.seat_id
		LEFT JOIN Venue_Area va ON va.area_id = s.area_id
		LEFT JOIN Venue v ON v.venue_id = va.venue_id
		LEFT JOIN Users u2 ON u2.user_id = r.processed_by
		WHERE r.report_id = ?
	`

	dto := &models.ReportDetailStaffDTO{}
	var (
		imageURL      sql.NullString
		seatID        sql.NullInt64
		seatCode      sql.NullString
		rowNo         sql.NullString
		colNo         sql.NullInt64
		areaID        sql.NullInt64
		areaName      sql.NullString
		floor         sql.NullInt64
		venueID       sql.NullInt64
		venueName     sql.NullString
		location      sql.NullString
		processedBy   sql.NullInt64
		processedAt   sql.NullTime
		staffNote     sql.NullString
		processedName sql.NullString
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
		&processedBy,
		&processedAt,
		&staffNote,
		&processedName,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			log.Info("Report not found", "reportID", reportID)
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get report detail: %w", err)
	}

	// DEBUG: Log the scanned values before mapping
	log.Info("🔍 Database Scan Result (before mapping nulls)",
		"reportID", dto.ReportID,
		"ticketID", dto.TicketID,
		"price", dto.Price,
		"seatID", seatID,
		"seatCode", seatCode,
		"rowNo", rowNo,
		"colNo", colNo,
		"areaID", areaID,
		"areaName", areaName,
		"floor", floor,
		"venueID", venueID,
		"venueName", venueName,
		"location", location,
	)

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
	if processedAt.Valid {
		dto.ProcessedAt = &processedAt.Time
	}
	if staffNote.Valid {
		dto.StaffNote = &staffNote.String
	}
	if processedName.Valid {
		dto.ProcessedBy = &processedName.String
	}

	// DEBUG: Log final DTO (after mapping nulls)
	log.Info("🔍 Repository Final DTO (after null mapping)",
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
	)

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
// ListReportsForStaffWithMetadata - List reports với search, filter, pagination và metadata
// Hỗ trợ tìm kiếm theo tên người gửi hoặc ticket ID
// Trả về: danh sách reports + tổng số items
// ============================================================
func (r *ReportRepository) ListReportsForStaffWithMetadata(ctx context.Context, status, search string, page, pageSize int) ([]models.ReportListStaffDTO, int, error) {
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

	// Base query
	baseQuery := `
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

	// Build WHERE clause
	var conditions []string
	args := []interface{}{}

	if status != "" {
		conditions = append(conditions, "r.status = ?")
		args = append(args, status)
	}

	if search != "" {
		// Tìm kiếm theo tên người gửi hoặc ticket ID
		searchPattern := "%" + search + "%"
		conditions = append(conditions, "(u.full_name LIKE ? OR CAST(r.ticket_id AS CHAR) LIKE ?)")
		args = append(args, searchPattern, searchPattern)
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total items (for metadata)
	countQuery := "SELECT COUNT(*) FROM Report r" +
		" JOIN Users u ON u.user_id = r.user_id" +
		" JOIN Ticket t ON t.ticket_id = r.ticket_id" +
		" JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id" +
		whereClause

	var totalItems int
	countArgs := args
	err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&totalItems)
	if err != nil && err != sql.ErrNoRows {
		return nil, 0, fmt.Errorf("failed to count reports: %w", err)
	}

	// Get paginated list
	query := baseQuery + whereClause + " ORDER BY r.created_at DESC LIMIT ? OFFSET ?"
	args = append(args, pageSize, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list reports: %w", err)
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
			return nil, 0, fmt.Errorf("failed to scan report row: %w", err)
		}

		if imageURL.Valid {
			dto.ImageURL = &imageURL.String
		}

		list = append(list, dto)
	}

	log.Info("Listed reports for staff with metadata", "status", status, "search", search, "page", page, "count", len(list), "total", totalItems)
	return list, totalItems, nil
}

// ============================================================
// GetReportStatusCounts - Get counts of reports grouped by status
// Returns: { pending: int, approved: int, rejected: int }
// Counts are calculated from ALL reports in DB, independent of current filter
// ============================================================
func (r *ReportRepository) GetReportStatusCounts(ctx context.Context) (map[string]int, error) {
	log := logger.Default().WithContext(ctx)

	query := `
		SELECT 
			SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
			SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
			SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
		FROM Report
	`

	counts := map[string]int{
		"pending":   0,
		"approved":  0,
		"rejected":  0,
		"processed": 0, // approved + rejected
	}

	var (
		pendingCount  sql.NullInt64
		approvedCount sql.NullInt64
		rejectedCount sql.NullInt64
	)

	err := r.db.QueryRowContext(ctx, query).Scan(
		&pendingCount,
		&approvedCount,
		&rejectedCount,
	)

	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to get report status counts: %w", err)
	}

	// Extract values with safe null handling
	if pendingCount.Valid {
		counts["pending"] = int(pendingCount.Int64)
	}
	if approvedCount.Valid {
		counts["approved"] = int(approvedCount.Int64)
	}
	if rejectedCount.Valid {
		counts["rejected"] = int(rejectedCount.Int64)
	}

	// Processed = approved + rejected
	counts["processed"] = counts["approved"] + counts["rejected"]

	log.Info("Got report status counts", "pending", counts["pending"], "processed", counts["processed"])
	return counts, nil
}

// ============================================================
// ProcessReport - APPROVE/REJECT report
// KHỚP VỚI Java ReportDAO.processReport
// ⭐ Phase 5: Khi SAGA_ENABLED=true → Saga Orchestration pattern
//
//	thay thế transaction chéo 3 domain (Staff + Ticket + Wallet)
//
// ⭐ Khi SAGA_ENABLED=false → Giữ nguyên logic cũ (monolith transaction)
// ============================================================
type ProcessReportResult struct {
	Success      bool
	Message      string
	RefundAmount *float64
}

func (r *ReportRepository) ProcessReport(ctx context.Context, reportID, staffID int, approve bool, staffNote *string) (*ProcessReportResult, error) {
	// ✅ Feature Flag: Chọn Saga hoặc Monolith
	if config.IsFeatureEnabled(config.FlagSagaEnabled) {
		return r.processReportSaga(ctx, reportID, staffID, approve, staffNote)
	}
	return r.processReportMonolith(ctx, reportID, staffID, approve, staffNote)
}

// ============================================================
// processReportSaga - Saga Orchestration Pattern (Phase 5)
//
// APPROVE Flow:
//
//	Step 1: Gọi /internal/ticket/refund → CHECKED_IN → REFUNDED
//	Step 2: Gọi /internal/wallet/credit → Cộng tiền vào ví user
//	Step 3: Cập nhật Report status → APPROVED (local DB)
//
// Compensation (nếu bất kỳ step nào lỗi):
//   - Nếu Step 2 lỗi: Gọi /internal/ticket/revert-refund → REFUNDED → CHECKED_IN
//   - Nếu Step 3 lỗi: Gọi /internal/ticket/revert-refund + xử lý wallet
//
// REJECT Flow: Chỉ update Report local (không cần Saga)
// ============================================================
func (r *ReportRepository) processReportSaga(ctx context.Context, reportID, staffID int, approve bool, staffNote *string) (*ProcessReportResult, error) {
	log := logger.Default().WithContext(ctx)
	result := &ProcessReportResult{
		Success: false,
		Message: "Unknown error",
	}

	log.Info("[SAGA_REFUND] 🔄 Starting Saga ProcessReport: reportID=%d, approve=%v", reportID, approve)

	// 1) Validate report status = PENDING (local DB, lightweight tx)
	var userID, ticketID int
	var reportStatus string
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	query := `SELECT user_id, ticket_id, status FROM Report WHERE report_id = ? FOR UPDATE`
	err = tx.QueryRowContext(ctx, query, reportID).Scan(&userID, &ticketID, &reportStatus)
	if err != nil {
		tx.Rollback()
		if err == sql.ErrNoRows {
			result.Message = "Không tìm thấy report"
			return result, nil
		}
		return nil, fmt.Errorf("failed to lock report: %w", err)
	}

	if reportStatus != "PENDING" {
		tx.Rollback()
		result.Message = "Report này đã được xử lý rồi"
		return result, nil
	}

	// 2) REJECT → chỉ update report local (không cần Saga)
	if !approve {
		rejectQuery := `
			UPDATE Report
			SET status = 'REJECTED', processed_by = ?, processed_at = UTC_TIMESTAMP(), staff_note = ?
			WHERE report_id = ? AND status = 'PENDING'
		`
		res, err := tx.ExecContext(ctx, rejectQuery, staffID, staffNote, reportID)
		if err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to reject report: %w", err)
		}
		rows, _ := res.RowsAffected()
		if rows <= 0 {
			tx.Rollback()
			result.Message = "Không thể từ chối (report không còn PENDING)"
			return result, nil
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("failed to commit reject: %w", err)
		}
		result.Success = true
		result.Message = "Đã từ chối report"
		log.Info("[SAGA_REFUND] ✅ Report rejected (no saga needed): reportID=%d", reportID)
		return result, nil
	}

	// Commit validation tx (release lock, sẽ re-lock ở Step 3)
	tx.Commit()

	client := utils.NewInternalClient()
	ticketServiceURL := utils.GetTicketServiceURL()

	// ============ SAGA STEP 1: Ticket Refund (CHECKED_IN → REFUNDED) ============
	log.Info("[SAGA_REFUND] Step 1: Calling /internal/ticket/refund for ticketID=%d", ticketID)

	type ticketRefundResp struct {
		Success        bool   `json:"success"`
		TicketID       int    `json:"ticketId"`
		PreviousStatus string `json:"previousStatus"`
		Message        string `json:"message"`
	}

	var refundResp ticketRefundResp
	refundURL := ticketServiceURL + "/internal/ticket/refund"
	refundBody := map[string]int{"ticketId": ticketID}

	// Inject internal call header
	ctx = utils.WithRequestHeaders(ctx, map[string]string{
		"X-Internal-Token": utils.GetInternalAuthToken(),
	})

	statusCode, err := client.PostJSON(ctx, refundURL, refundBody, &refundResp)
	if err != nil || statusCode != http.StatusOK || !refundResp.Success {
		errMsg := "Lỗi khi refund vé"
		if err != nil {
			errMsg = fmt.Sprintf("Lỗi gọi ticket service: %v", err)
		} else if !refundResp.Success {
			errMsg = fmt.Sprintf("Chỉ hoàn tiền cho vé đã CHECKED_IN (hiện tại: %s)", refundResp.PreviousStatus)
		}
		log.Info("[SAGA_REFUND] ❌ Step 1 FAILED: %s", errMsg)
		result.Message = errMsg
		return result, nil
	}
	log.Info("[SAGA_REFUND] ✅ Step 1 SUCCESS: Ticket %d → REFUNDED", ticketID)

	// ============ SAGA STEP 2: Wallet Credit (cộng tiền cho user) ============
	// Lấy giá vé (refund amount) từ ticket info
	type ticketInfoResp struct {
		TicketID     int     `json:"ticketId"`
		UserID       int     `json:"userId"`
		CategoryName string  `json:"categoryName"`
		Price        float64 `json:"price"`
	}

	var ticketInfo ticketInfoResp
	infoURL := ticketServiceURL + "/internal/ticket/info"
	infoStatusCode, infoErr := client.GetJSON(ctx, infoURL, map[string]string{
		"ticketId": strconv.Itoa(ticketID),
	}, &ticketInfo)

	var refund float64
	if infoErr != nil || infoStatusCode != http.StatusOK {
		// Fallback: query local DB for price
		log.Info("[SAGA_REFUND] ⚠️ Ticket info API failed, falling back to local DB")
		fallbackQuery := `
			SELECT ct.price FROM Ticket t
			JOIN Category_Ticket ct ON ct.category_ticket_id = t.category_ticket_id
			WHERE t.ticket_id = ?
		`
		if scanErr := r.db.QueryRowContext(ctx, fallbackQuery, ticketID).Scan(&refund); scanErr != nil {
			// COMPENSATION: Revert ticket status
			log.Info("[SAGA_REFUND] ❌ Cannot get price, compensating Step 1...")
			r.compensateTicketRefund(ctx, client, ticketServiceURL, ticketID)
			result.Message = "Không tìm thấy giá vé để hoàn tiền"
			return result, nil
		}
	} else {
		refund = ticketInfo.Price
	}

	log.Info("[SAGA_REFUND] Step 2: Calling /internal/wallet/credit for userID=%d, amount=%.2f", userID, refund)

	type walletTxResp struct {
		Success       bool    `json:"success"`
		TransactionID int     `json:"transactionId"`
		BalanceBefore float64 `json:"balanceBefore"`
		BalanceAfter  float64 `json:"balanceAfter"`
		Message       string  `json:"message"`
	}

	var creditResp walletTxResp
	creditURL := ticketServiceURL + "/internal/wallet/credit"
	creditBody := models.WalletCreditRequest{
		UserID:        userID,
		Amount:        refund,
		ReferenceType: "REFUND",
		ReferenceID:   fmt.Sprintf("report:%d", reportID),
		Description:   fmt.Sprintf("Hoàn tiền report #%d, ticket #%d", reportID, ticketID),
	}

	creditStatusCode, creditErr := client.PostJSON(ctx, creditURL, creditBody, &creditResp)
	if creditErr != nil || creditStatusCode != http.StatusOK || !creditResp.Success {
		// COMPENSATION: Revert ticket status (Step 1)
		log.Info("[SAGA_REFUND] ❌ Step 2 FAILED: Wallet credit error, compensating Step 1...")
		r.compensateTicketRefund(ctx, client, ticketServiceURL, ticketID)

		errMsg := "Lỗi khi cộng tiền hoàn vào ví"
		if creditErr != nil {
			errMsg = fmt.Sprintf("Lỗi gọi wallet service: %v", creditErr)
		}
		result.Message = errMsg
		return result, nil
	}
	log.Info("[SAGA_REFUND] ✅ Step 2 SUCCESS: Wallet credited %.2f for user %d", refund, userID)

	// ============ SAGA STEP 3: Update Report status → APPROVED (local DB) ============
	log.Info("[SAGA_REFUND] Step 3: Updating Report %d → APPROVED", reportID)

	approveQuery := `
		UPDATE Report
		SET status = 'APPROVED', processed_by = ?, processed_at = UTC_TIMESTAMP(), refund_amount = ?, staff_note = ?
		WHERE report_id = ? AND status = 'PENDING'
	`
	res, err := r.db.ExecContext(ctx, approveQuery, staffID, refund, staffNote, reportID)
	if err != nil {
		// COMPENSATION: Revert Step 1 + Step 2 (ticket + wallet)
		log.Info("[SAGA_REFUND] ❌ Step 3 FAILED: Report update error, compensating Steps 1 & 2...")
		r.compensateTicketRefund(ctx, client, ticketServiceURL, ticketID)
		// Note: Wallet compensation (debit back) is complex; log for manual review
		log.Warn("[SAGA_REFUND] ⚠️ Wallet credit of %.2f for user %d needs manual reversal (report update failed)", refund, userID)
		return nil, fmt.Errorf("failed to approve report: %w", err)
	}

	rows, _ := res.RowsAffected()
	if rows <= 0 {
		// COMPENSATION: Revert Step 1 + Step 2
		log.Info("[SAGA_REFUND] ❌ Step 3 FAILED: Report no longer PENDING, compensating...")
		r.compensateTicketRefund(ctx, client, ticketServiceURL, ticketID)
		log.Warn("[SAGA_REFUND] ⚠️ Wallet credit of %.2f for user %d needs manual reversal (report no longer PENDING)", refund, userID)
		result.Message = "Không thể approve (report không còn PENDING)"
		return result, nil
	}

	result.Success = true
	result.RefundAmount = &refund
	result.Message = "Đã duyệt và hoàn tiền thành công"

	log.Info("[SAGA_REFUND] ✅✅✅ Saga COMPLETED: reportID=%d, ticketID=%d, userID=%d, refund=%.2f",
		reportID, ticketID, userID, refund)

	return result, nil
}

// compensateTicketRefund gọi /internal/ticket/revert-refund để hoàn tác Step 1
func (r *ReportRepository) compensateTicketRefund(ctx context.Context, client *utils.InternalClient, ticketServiceURL string, ticketID int) {
	log := logger.Default().WithContext(ctx)

	revertURL := ticketServiceURL + "/internal/ticket/revert-refund"
	revertBody := map[string]interface{}{
		"ticketId":     ticketID,
		"targetStatus": "CHECKED_IN",
	}

	_, _, revertErr := client.Post(ctx, revertURL, revertBody)
	if revertErr != nil {
		log.Warn("[SAGA_COMPENSATION] ❌ Failed to revert ticket %d: %v (MANUAL INTERVENTION REQUIRED)", ticketID, revertErr)
	} else {
		log.Info("[SAGA_COMPENSATION] ✅ Ticket %d reverted to CHECKED_IN", ticketID)
	}
}

// ============================================================
// processReportMonolith - Logic cũ (monolith transaction)
// Giữ nguyên khi SAGA_ENABLED=false
// ============================================================
func (r *ReportRepository) processReportMonolith(ctx context.Context, reportID, staffID int, approve bool, staffNote *string) (*ProcessReportResult, error) {
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

	// 1) Lock report row
	var userID, ticketID int
	var reportStatus string

	query := `SELECT user_id, ticket_id, status FROM Report WHERE report_id = ? FOR UPDATE`
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

	// 2) REJECT
	if !approve {
		rejectQuery := `
			UPDATE Report
			SET status = 'REJECTED', processed_by = ?, processed_at = UTC_TIMESTAMP(), staff_note = ?
			WHERE report_id = ? AND status = 'PENDING'
		`
		res, err := tx.ExecContext(ctx, rejectQuery, staffID, staffNote, reportID)
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

	// 3) APPROVE: Validate ticket CHECKED_IN
	var ticketStatus string
	query = `SELECT status FROM Ticket WHERE ticket_id = ? FOR UPDATE`
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

	// 4) Get refund amount
	var refund float64
	query = `
		SELECT ct.price FROM Ticket t
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

	// 5) Credit refund to Wallet table (Single Source of Truth)
	// All wallet writes go through Wallet table only. Auth Service manages Users.Wallet via API.
	var walletID int
	var balanceBefore float64
	err = tx.QueryRowContext(ctx, "SELECT wallet_id, balance FROM Wallet WHERE user_id = ? FOR UPDATE", userID).Scan(&walletID, &balanceBefore)
	if err == sql.ErrNoRows {
		// Auto-create wallet with balance 0 (Auth Service manages Users.Wallet via API)
		insertResult, insertErr := tx.ExecContext(ctx,
			"INSERT INTO Wallet (user_id, balance, currency, status) VALUES (?, 0, 'VND', 'ACTIVE')", userID)
		if insertErr != nil {
			return nil, fmt.Errorf("failed to create wallet: %w", insertErr)
		}
		id, _ := insertResult.LastInsertId()
		walletID = int(id)
		balanceBefore = 0
		log.Info("[WALLET_MIGRATE] ✅ Created Wallet for user=%d, balance=0", userID)
	} else if err != nil {
		return nil, fmt.Errorf("failed to lock wallet: %w", err)
	}

	newBalance := balanceBefore + refund
	_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = ? WHERE wallet_id = ?", newBalance, walletID)
	if err != nil {
		return nil, fmt.Errorf("failed to update wallet: %w", err)
	}

	// Log refund transaction
	_, txErr := tx.ExecContext(ctx,
		`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES (?, ?, 'CREDIT', ?, ?, ?, 'REFUND', ?, ?)`,
		walletID, userID, refund, balanceBefore, newBalance,
		fmt.Sprintf("report:%d", reportID),
		fmt.Sprintf("Hoàn tiền report #%d, ticket #%d", reportID, ticketID),
	)
	if txErr != nil {
		log.Warn("[WALLET_TX] ⚠️ Failed to log Wallet_Transaction: %v", txErr)
	}

	// 6) Update Ticket → REFUNDED
	query = `UPDATE Ticket SET status = 'REFUNDED' WHERE ticket_id = ? AND status = 'CHECKED_IN'`
	res, err := tx.ExecContext(ctx, query, ticketID)
	if err != nil {
		return nil, fmt.Errorf("failed to update ticket status: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows <= 0 {
		result.Message = "Không cập nhật được trạng thái ticket (ticket không còn CHECKED_IN)"
		return result, nil
	}

	// 7) Update Report → APPROVED
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

	// 8) Commit
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
