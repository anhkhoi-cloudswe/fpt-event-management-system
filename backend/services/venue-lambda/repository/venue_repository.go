package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/services/venue-lambda/models"
)

type VenueRepository struct {
	db *sql.DB
}

func NewVenueRepository() *VenueRepository {
	return &VenueRepository{
		db: db.GetDB(),
	}
}

// ============================================================
// GetAllVenues - Lấy tất cả venues với nested areas
// ============================================================
func (r *VenueRepository) GetAllVenues(ctx context.Context) ([]models.Venue, error) {
	// Get venues
	venueQuery := `SELECT venue_id, venue_name, location, status FROM Venue WHERE status != 'DELETED' ORDER BY venue_id`
	rows, err := r.db.QueryContext(ctx, venueQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query venues: %w", err)
	}
	defer rows.Close()

	venueMap := make(map[int]*models.Venue)
	var venues []models.Venue

	for rows.Next() {
		var venue models.Venue
		var location sql.NullString

		err := rows.Scan(&venue.VenueID, &venue.VenueName, &location, &venue.Status)
		if err != nil {
			return nil, fmt.Errorf("failed to scan venue: %w", err)
		}

		if location.Valid {
			venue.Location = &location.String
		}
		venue.Areas = []models.VenueArea{}
		venues = append(venues, venue)
		venueMap[venue.VenueID] = &venues[len(venues)-1]
	}

	// Get areas for all venues
	areaQuery := `SELECT area_id, venue_id, area_name, floor, capacity, status FROM Venue_Area WHERE status != 'DELETED' ORDER BY venue_id, area_id`
	areaRows, err := r.db.QueryContext(ctx, areaQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query areas: %w", err)
	}
	defer areaRows.Close()

	for areaRows.Next() {
		var area models.VenueArea
		var floor sql.NullString
		var capacity sql.NullInt64

		err := areaRows.Scan(&area.AreaID, &area.VenueID, &area.AreaName, &floor, &capacity, &area.Status)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area: %w", err)
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		if capacity.Valid {
			cap := int(capacity.Int64)
			area.Capacity = &cap
		}

		if venue, ok := venueMap[area.VenueID]; ok {
			venue.Areas = append(venue.Areas, area)
		}
	}

	return venues, nil
}

// ============================================================
// GetVenueByID - Lấy venue theo ID
// ============================================================
func (r *VenueRepository) GetVenueByID(ctx context.Context, venueID int) (*models.Venue, error) {
	query := `SELECT venue_id, venue_name, location, status FROM Venue WHERE venue_id = ?`

	var venue models.Venue
	var location sql.NullString

	err := r.db.QueryRowContext(ctx, query, venueID).Scan(&venue.VenueID, &venue.VenueName, &location, &venue.Status)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query venue: %w", err)
	}

	if location.Valid {
		venue.Location = &location.String
	}

	// Get areas
	areaQuery := `SELECT area_id, venue_id, area_name, floor, capacity, status FROM Venue_Area WHERE venue_id = ? AND status != 'DELETED'`
	rows, err := r.db.QueryContext(ctx, areaQuery, venueID)
	if err != nil {
		return nil, fmt.Errorf("failed to query areas: %w", err)
	}
	defer rows.Close()

	venue.Areas = []models.VenueArea{}
	for rows.Next() {
		var area models.VenueArea
		var floor sql.NullString
		var capacity sql.NullInt64

		err := rows.Scan(&area.AreaID, &area.VenueID, &area.AreaName, &floor, &capacity, &area.Status)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area: %w", err)
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		if capacity.Valid {
			cap := int(capacity.Int64)
			area.Capacity = &cap
		}
		venue.Areas = append(venue.Areas, area)
	}

	return &venue, nil
}

// ============================================================
// CreateVenue - Tạo venue mới
// ============================================================
func (r *VenueRepository) CreateVenue(ctx context.Context, req models.CreateVenueRequest) (int64, error) {
	query := `INSERT INTO Venue (venue_name, location, status) VALUES (?, ?, 'AVAILABLE')`

	result, err := r.db.ExecContext(ctx, query, req.VenueName, req.Location)
	if err != nil {
		return 0, fmt.Errorf("failed to create venue: %w", err)
	}

	return result.LastInsertId()
}

// ============================================================
// UpdateVenue - Cập nhật venue
// ============================================================
func (r *VenueRepository) UpdateVenue(ctx context.Context, req models.UpdateVenueRequest) error {
	query := `UPDATE Venue SET venue_name = ?, location = ?, status = ? WHERE venue_id = ?`

	_, err := r.db.ExecContext(ctx, query, req.VenueName, req.Location, req.Status, req.VenueID)
	if err != nil {
		return fmt.Errorf("failed to update venue: %w", err)
	}

	return nil
}

// ============================================================
// HasActiveEvents - Kiểm tra xem venue có sự kiện OPEN/DRAFT không
// ============================================================
func (r *VenueRepository) HasActiveEvents(ctx context.Context, venueID int) (bool, error) {
	// Query: Check if any Event exists in areas of this venue with status OPEN or DRAFT
	query := `
		SELECT COUNT(*) as count 
		FROM Event e
		INNER JOIN Venue_Area va ON e.area_id = va.area_id
		WHERE va.venue_id = ? 
		AND e.status IN ('OPEN', 'DRAFT')
	`

	var count int
	err := r.db.QueryRowContext(ctx, query, venueID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check active events: %w", err)
	}

	return count > 0, nil
}

// ============================================================
// DeleteVenue - Soft delete venue
// ============================================================
func (r *VenueRepository) DeleteVenue(ctx context.Context, venueID int) error {
	query := `UPDATE Venue SET status = 'DELETED' WHERE venue_id = ?`

	_, err := r.db.ExecContext(ctx, query, venueID)
	if err != nil {
		return fmt.Errorf("failed to delete venue: %w", err)
	}

	return nil
}

// ============================================================
// GetAllAreas - Lấy tất cả areas
// ============================================================
func (r *VenueRepository) GetAllAreas(ctx context.Context) ([]models.VenueArea, error) {
	query := `SELECT area_id, venue_id, area_name, floor, capacity, status FROM Venue_Area WHERE status != 'DELETED' ORDER BY venue_id, area_id`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query areas: %w", err)
	}
	defer rows.Close()

	var areas []models.VenueArea
	for rows.Next() {
		var area models.VenueArea
		var floor sql.NullString
		var capacity sql.NullInt64

		err := rows.Scan(&area.AreaID, &area.VenueID, &area.AreaName, &floor, &capacity, &area.Status)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area: %w", err)
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		if capacity.Valid {
			cap := int(capacity.Int64)
			area.Capacity = &cap
		}
		areas = append(areas, area)
	}

	return areas, nil
}

// GetAreasByVenueID - Lấy areas theo venue ID
// ============================================================
func (r *VenueRepository) GetAreasByVenueID(ctx context.Context, venueID int) ([]models.VenueArea, error) {
	query := `SELECT area_id, venue_id, area_name, floor, capacity, status FROM Venue_Area WHERE venue_id = ? AND status != 'DELETED' ORDER BY area_id`

	rows, err := r.db.QueryContext(ctx, query, venueID)
	if err != nil {
		return nil, fmt.Errorf("failed to query areas by venue ID: %w", err)
	}
	defer rows.Close()

	var areas []models.VenueArea
	for rows.Next() {
		var area models.VenueArea
		var floor sql.NullString
		var capacity sql.NullInt64

		err := rows.Scan(&area.AreaID, &area.VenueID, &area.AreaName, &floor, &capacity, &area.Status)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area: %w", err)
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		if capacity.Valid {
			cap := int(capacity.Int64)
			area.Capacity = &cap
		}
		areas = append(areas, area)
	}

	return areas, nil
}

// ============================================================
// GetFreeAreas - Lấy các area còn trống trong khoảng thời gian
// Buffer 1 giờ: startBuffer = startTime - 1h, endBuffer = endTime + 1h
// ============================================================
func (r *VenueRepository) GetFreeAreas(ctx context.Context, startTime, endTime string) ([]models.FreeAreaResponse, error) {
	// Helper function to parse time with multiple formats
	parseTime := func(timeStr string) (time.Time, error) {
		// Try format with T (ISO8601): 2006-01-02T15:04:05
		t, err := time.Parse("2006-01-02T15:04:05", timeStr)
		if err == nil {
			return t, nil
		}

		// Try format with space: 2006-01-02 15:04:05
		t, err = time.Parse("2006-01-02 15:04:05", timeStr)
		if err == nil {
			return t, nil
		}

		return time.Time{}, fmt.Errorf("invalid time format: %s (expected: YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM:SS)", timeStr)
	}

	// Parse time strings to add 1 hour buffer
	startParsed, err := parseTime(startTime)
	if err != nil {
		return nil, fmt.Errorf("failed to parse startTime: %w", err)
	}
	endParsed, err := parseTime(endTime)
	if err != nil {
		return nil, fmt.Errorf("failed to parse endTime: %w", err)
	}

	// Add 1 hour buffer
	startBuffer := startParsed.Add(-1 * time.Hour).Format("2006-01-02 15:04:05")
	endBuffer := endParsed.Add(1 * time.Hour).Format("2006-01-02 15:04:05")

	query := `
		SELECT va.area_id, va.area_name, va.floor, va.capacity, v.venue_id, v.venue_name, v.location
		FROM Venue_Area va
		JOIN Venue v ON va.venue_id = v.venue_id
		WHERE va.status = 'AVAILABLE' 
		AND v.status = 'AVAILABLE'
		AND va.area_id NOT IN (
			SELECT e.area_id FROM Event e
			WHERE e.status IN ('OPEN', 'CLOSED', 'DRAFT')
			AND e.area_id IS NOT NULL
			AND e.start_time < ?
			AND e.end_time > ?
		)
		ORDER BY v.venue_name, va.area_name
	`

	rows, err := r.db.QueryContext(ctx, query, endBuffer, startBuffer)
	if err != nil {
		return nil, fmt.Errorf("failed to query free areas: %w", err)
	}
	defer rows.Close()

	var areas []models.FreeAreaResponse
	for rows.Next() {
		var area models.FreeAreaResponse
		var floor sql.NullString
		var capacity sql.NullInt64
		var location sql.NullString

		err := rows.Scan(&area.AreaID, &area.AreaName, &floor, &capacity, &area.VenueID, &area.VenueName, &location)
		if err != nil {
			return nil, fmt.Errorf("failed to scan area: %w", err)
		}

		if floor.Valid {
			area.Floor = &floor.String
		}
		if capacity.Valid {
			cap := int(capacity.Int64)
			area.Capacity = &cap
		}
		if location.Valid {
			area.VenueAddress = &location.String
		}
		areas = append(areas, area)
	}

	return areas, nil
}

// ============================================================
// GetAllSeats - Lấy tất cả seats của area
// ✅ FIXED: JOIN với category_ticket, sử dụng alias rõ ràng, handle NULL properly
// ============================================================
func (r *VenueRepository) GetAllSeats(ctx context.Context, areaID int) ([]models.Seat, error) {
	query := `
		SELECT 
			s.seat_id,
			s.area_id,
			s.seat_code,
			s.status AS seat_status,
			s.row_no,
			s.col_no,
			s.category_ticket_id,
			ct.name AS category_name
		FROM Seat s
		LEFT JOIN category_ticket ct ON s.category_ticket_id = ct.category_ticket_id
		WHERE s.area_id = ?
		ORDER BY s.row_no, s.col_no
	`

	rows, err := r.db.QueryContext(ctx, query, areaID)
	if err != nil {
		log.Printf("SQL Error in GetAllSeats: %v", err)
		return nil, fmt.Errorf("failed to query seats: %w", err)
	}
	defer rows.Close()

	var seats []models.Seat
	for rows.Next() {
		var seat models.Seat
		var row sql.NullString
		var column sql.NullInt64
		var categoryTicketID sql.NullInt64
		var categoryName sql.NullString

		err := rows.Scan(
			&seat.SeatID,
			&seat.AreaID,
			&seat.SeatCode,
			&seat.Status,
			&row,
			&column,
			&categoryTicketID,
			&categoryName,
		)
		if err != nil {
			log.Printf("SQL Scan Error in GetAllSeats: %v", err)
			return nil, fmt.Errorf("failed to scan seat: %w", err)
		}

		// ✅ Handle NULL values properly
		if row.Valid {
			seat.Row = &row.String
			seat.SeatRow = &row.String
		}
		if column.Valid {
			col := int(column.Int64)
			seat.Column = &col
			seat.SeatColumn = &col
		}
		if categoryTicketID.Valid {
			cid := int(categoryTicketID.Int64)
			seat.CategoryTicketID = &cid
		}
		// ✅ ONLY map category_name when category_ticket_id is set
		if categoryName.Valid {
			seat.CategoryName = &categoryName.String
			seat.SeatType = &categoryName.String
		}

		seats = append(seats, seat)
	}

	return seats, nil
}

// ============================================================
// CreateArea - Tạo area mới
// ============================================================
func (r *VenueRepository) CreateArea(ctx context.Context, req models.CreateAreaRequest) (int64, error) {
	query := `INSERT INTO Venue_Area (venue_id, area_name, floor, capacity, status) VALUES (?, ?, ?, ?, 'AVAILABLE')`

	result, err := r.db.ExecContext(ctx, query, req.VenueID, req.AreaName, req.Floor, req.Capacity)
	if err != nil {
		return 0, fmt.Errorf("failed to create area: %w", err)
	}

	return result.LastInsertId()
}

// ============================================================
// UpdateArea - Cập nhật area
// ============================================================
func (r *VenueRepository) UpdateArea(ctx context.Context, req models.UpdateAreaRequest) error {
	query := `UPDATE Venue_Area SET area_name = ?, floor = ?, capacity = ?, status = ? WHERE area_id = ?`

	_, err := r.db.ExecContext(ctx, query, req.AreaName, req.Floor, req.Capacity, req.Status, req.AreaID)
	if err != nil {
		return fmt.Errorf("failed to update area: %w", err)
	}

	return nil
}

// ============================================================
// DeleteArea - Soft delete area
// ============================================================
func (r *VenueRepository) DeleteArea(ctx context.Context, areaID int) error {
	query := `UPDATE Venue_Area SET status = 'DELETED' WHERE area_id = ?`

	_, err := r.db.ExecContext(ctx, query, areaID)
	if err != nil {
		return fmt.Errorf("failed to delete area: %w", err)
	}

	return nil
}

// ============================================================
// GetSeatsForEvent - Lấy ghế theo event (JOIN Seat + category_ticket + Ticket for status)
// ✅ FIXED: Get area_id from Event first, return ALL seats in that area
// ============================================================
func (r *VenueRepository) GetSeatsForEvent(ctx context.Context, eventID int, seatType string) ([]models.Seat, error) {
	// STEP 1: Get area_id from Event table
	var areaID int
	areaQuery := `SELECT area_id FROM Event WHERE event_id = ?`
	err := r.db.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)
	if err != nil {
		log.Printf("SQL Error getting area_id for event %d: %v", eventID, err)
		return nil, fmt.Errorf("failed to get area_id for event: %w", err)
	}
	log.Printf("[GetSeatsForEvent] ✅ AREA_ID ASSIGNED: Event %d is in area_id=%d (will be used for response)", eventID, areaID)

	// STEP 2: Query ALL seats in that area with LEFT JOIN to category_ticket
	// ✅ CRITICAL: event_id condition MUST be in ON clause, NOT in WHERE
	// ✅ RETURN ALL SEATS: Using LEFT JOIN allows seats with category_ticket_id=NULL to show (unallocated seats as "Ghế trống")
	// ✅ FILTER: When seatType is empty, query returns ALL seats. When seatType specified, filters to matching category only
	query := `
		SELECT 
			s.seat_id,
			s.area_id,
			s.seat_code,
			s.row_no AS seat_row,
			s.col_no AS seat_column,
			s.category_ticket_id,
			ct.name AS category_name,
			ct.price AS ticket_price,
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
			LEFT JOIN category_ticket ct ON s.category_ticket_id = ct.category_ticket_id AND ct.event_id = ?
			WHERE s.area_id = ?
			  AND s.status = 'ACTIVE'
	`
	// ✅ FILTER: Handle both allocated (ct.name matches) and unallocated (ct.name=NULL) cases
	// - If seatType is empty: return ALL seats including those with ct.name=NULL (unallocated/fallback)
	// - If seatType specified: return ONLY allocated seats where ct.name=seatType
	args := []interface{}{eventID, eventID, eventID, areaID}
	if seatType != "" {
		log.Printf("[GetSeatsForEvent] 🔍 CATEGORY_FILTER APPLIED: %s (strict allocation only, no unallocated fallback)", seatType)
		// When seatType specified, show ONLY allocated seats with matching category
		switch seatType {
		case "VIP":
			// VIP: only show allocated VIP seats
			query += " AND ct.name = ?"
			args = append(args, seatType)
		case "STANDARD":
			// STANDARD: only show allocated Standard seats
			query += " AND ct.name = ?"
			args = append(args, seatType)
		default:
			// Unknown category: only show allocated seats
			query += " AND ct.name = ?"
			args = append(args, seatType)
		}
	} else {
		log.Printf("[GetSeatsForEvent] 📂 NO_CATEGORY_FILTER: Returning ALL seats (allocated + unallocated/NULL) per LEFT JOIN")
	}

	log.Printf("[GetSeatsForEvent] 📍 QUERY_CONFIG: event_id=%d, area_id=%d, seatType='%s', totalParams=%d", eventID, areaID, seatType, len(args))

	query += " ORDER BY s.row_no, s.col_no, s.seat_code"

	// Log the final SQL and args for debugging (helps reproduce in terminal)
	log.Printf("[GetSeatsForEvent] Executing SQL: %s", query)
	log.Printf("[GetSeatsForEvent] SQL args: %+v", args)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		log.Printf("SQL Error in GetSeatsForEvent: %v | eventID=%d | seatType=%s", err, eventID, seatType)
		return nil, fmt.Errorf("failed to query seats for event: %w", err)
	}
	defer rows.Close()

	var seats []models.Seat
	var seatCount int
	for rows.Next() {
		var seat models.Seat
		var rowName sql.NullString
		var colNumber sql.NullInt64
		var categoryTicketID sql.NullInt64
		var categoryName sql.NullString
		var ticketPrice sql.NullFloat64
		var status string

		err := rows.Scan(
			&seat.SeatID,
			&seat.AreaID,
			&seat.SeatCode,
			&rowName,
			&colNumber,
			&categoryTicketID,
			&categoryName,
			&ticketPrice,
			&status,
		)
		if err != nil {
			log.Printf("SQL Scan Error in GetSeatsForEvent: %v", err)
			return nil, fmt.Errorf("failed to scan seat: %w", err)
		}

		// ✅ FIX: Ensure returned AreaID comes from function parameter `areaID` when available
		// Do not take areaId from joined tables. Prefer the event's areaID.
		scannedArea := seat.AreaID
		if areaID != 0 {
			seat.AreaID = areaID
		} else {
			seat.AreaID = scannedArea
		}
		if scannedArea != seat.AreaID {
			log.Printf("[GetSeatsForEvent] Note: seat_id=%d scanned area=%d -> using area=%d", seat.SeatID, scannedArea, seat.AreaID)
		}

		// ✅ Map nullable fields properly
		if rowName.Valid {
			seat.Row = &rowName.String
			seat.SeatRow = &rowName.String
		}
		if colNumber.Valid {
			col := int(colNumber.Int64)
			seat.Column = &col
			seat.SeatColumn = &col
		}
		if categoryTicketID.Valid {
			cid := int(categoryTicketID.Int64)
			seat.CategoryTicketID = &cid
		}
		// ✅ ONLY map category_name/price when category_ticket_id is set
		// No fallback - NULL means allocation didn't happen or failed
		if categoryName.Valid {
			seat.CategoryName = &categoryName.String
			seat.SeatType = &categoryName.String
		}
		if ticketPrice.Valid {
			seat.Price = &ticketPrice.Float64
		}

		seat.Status = status
		seats = append(seats, seat)

		// Log first 3 seats for debugging
		seatCount++
		if seatCount <= 3 {
			log.Printf("[GetSeatsForEvent] ✓ Seat[%d]: ID=%d, Code=%s, Area=%d, Row=%v, Category=%s, Status=%s",
				seatCount, seat.SeatID, seat.SeatCode, seat.AreaID, rowName, categoryName, status)
		}
	}

	log.Printf("[GetSeatsForEvent] ✅ Successfully retrieved %d seats from area_id=%d", len(seats), areaID)

	// ✅ FIX 3A: Force AreaID to event's area to ensure response.AreaID is never null
	// This must be done for ALL seats, not just some
	log.Printf("[GetSeatsForEvent] 🔧 RESPONSE_MAPPING START: Setting AreaID=%d for all %d seats in response", areaID, len(seats))
	for i := range seats {
		seats[i].AreaID = areaID
		// Verify seat has proper mapping (useful for debugging)
		if i < 3 {
			log.Printf("[GetSeatsForEvent] 🪑 Seat[%d] mapped: code=%s, area_id=%d, category=%v, ticketID=%v",
				i, seats[i].SeatCode, seats[i].AreaID, seats[i].CategoryName, seats[i].CategoryTicketID)
		}
	}
	log.Printf("[GetSeatsForEvent] ✅ RESPONSE_MAPPING COMPLETE: All seats assigned area_id=%d (never null)", areaID)

	// Log first 5 ROWS (rows A, B, C, D, E - not individual seats) with seat_id and category_ticket_id for MySQL comparison
	log.Printf("[GetSeatsForEvent] 🔍 DEBUG: First 5 rows from area_id=%d for event_id=%d:", areaID, eventID)

	var previousRow string
	var rowCount int
	for i := 0; i < len(seats) && rowCount < 5; i++ {
		s := seats[i]
		currentRow := ""
		if s.SeatRow != nil {
			currentRow = *s.SeatRow
		}

		// Only count unique rows
		if currentRow != previousRow && currentRow != "" {
			rowCount++
			previousRow = currentRow

			// Log all seats in this row
			var cid interface{}
			if s.CategoryTicketID != nil {
				cid = *s.CategoryTicketID
			} else {
				cid = "NULL"
			}
			log.Printf("[GetSeatsForEvent] 🪑 Row %s | Seat: ID=%d, Code=%s, Category_Ticket_ID=%v, Status=%s",
				currentRow, s.SeatID, s.SeatCode, cid, s.Status)
		}
	}

	return seats, nil
}

// ============================================================
// ReconfigureSeatsForEvent - Reconfigure seat layout cho event
// Tương tự Java EventSeatLayoutDAO.reconfigureSeatsForEvent()
// Xóa layout cũ và tạo layout mới dựa trên VIP/STANDARD count
// ============================================================
func (r *VenueRepository) ReconfigureSeatsForEvent(ctx context.Context, tx *sql.Tx, eventID int, areaID int, vipCount int, standardCount int) error {
	totalNeeded := vipCount + standardCount

	// 1. Lấy danh sách ghế vật lý ACTIVE trong area
	query := `
		SELECT seat_id 
		FROM Seat 
		WHERE area_id = ? AND status = 'ACTIVE'
		ORDER BY row_no, col_no, seat_code
	`

	rows, err := tx.QueryContext(ctx, query, areaID)
	if err != nil {
		return fmt.Errorf("failed to query seats: %w", err)
	}
	defer rows.Close()

	var seatIDs []int
	for rows.Next() {
		var seatID int
		if err := rows.Scan(&seatID); err != nil {
			return fmt.Errorf("failed to scan seat ID: %w", err)
		}
		seatIDs = append(seatIDs, seatID)
	}

	// Kiểm tra đủ ghế không
	if len(seatIDs) < totalNeeded {
		return fmt.Errorf("not enough physical seats in area_id=%d | active seats=%d < required=%d",
			areaID, len(seatIDs), totalNeeded)
	}

	// 2. Xóa layout cũ
	_, err = tx.ExecContext(ctx, "DELETE FROM Event_Seat_Layout WHERE event_id = ?", eventID)
	if err != nil {
		return fmt.Errorf("failed to delete old layout: %w", err)
	}

	// 3. Insert layout mới
	insertQuery := `
		INSERT INTO Event_Seat_Layout (event_id, seat_id, seat_type, status)
		VALUES (?, ?, ?, 'AVAILABLE')
	`

	stmt, err := tx.PrepareContext(ctx, insertQuery)
	if err != nil {
		return fmt.Errorf("failed to prepare insert: %w", err)
	}
	defer stmt.Close()

	for i := 0; i < totalNeeded; i++ {
		seatID := seatIDs[i]
		seatType := "STANDARD"
		if i < vipCount {
			seatType = "VIP"
		}

		_, err = stmt.ExecContext(ctx, eventID, seatID, seatType)
		if err != nil {
			return fmt.Errorf("failed to insert layout: %w", err)
		}
	}

	return nil
}
