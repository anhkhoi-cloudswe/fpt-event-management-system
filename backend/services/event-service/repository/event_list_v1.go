package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-service/models"
)

// EventListV1Result represents the paginated events response
type EventListV1Result struct {
	Data       []models.EventListItem `json:"data"`
	Total      int                    `json:"total"`
	Page       int                    `json:"page"`
	Limit      int                    `json:"limit"`
	TotalPages int                    `json:"totalPages"`
}

// GetEventsByStatusV1 - Get events filtered by status, search, and pagination
// Endpoint: GET /api/v1/events
//
// Parameters:
//   - status: 'open' or 'today' (today's events), 'upcoming' (future events), 'past' or 'closed' (past events)
//   - search: search string to filter by title (optional, uses LIKE)
//   - page: page number (default 1)
//   - limit: items per page (default 12, max 100)
//
// Returns:
//   - Total count of matching events
//   - Paginated list of events
//   - Total pages
//
// Logic:
// 1. Build WHERE conditions based on status:
//   - 'open'/'today': DATE(start_time) = CURDATE() AND status != 'CLOSED'
//     → Only shows today's events (server timezone), excluding closed events
//   - 'upcoming': status='OPEN' AND start_time > NOW()
//     → Shows future events
//   - 'past'/'closed': status='CLOSED' ONLY
//     → Shows only explicitly closed events (NOT based on end_time < NOW())
//     2. If search provided: AND (e.title LIKE ? OR va.area_name LIKE ? OR v.venue_name LIKE ?)
//     → Search is combined with status filter using AND
//     3. Calculate OFFSET = (page - 1) * limit
//     4. Run 2 queries:
//   - COUNT(DISTINCT e.event_id) for total matching records
//   - SELECT ... LIMIT ? OFFSET ? for paginated results
//     5. Return both total count and results
//
// Frontend Mapping:
//   - Tab "Sự kiện hôm nay" → sends status='open' → Backend filters TODAY's events
//   - Tab "Sự kiện sắp diễn ra" → sends status='upcoming' → Backend filters FUTURE events
//   - Tab "Sự kiện đã kết thúc" → sends status='closed' → Backend filters PAST/CLOSED events
func (r *EventRepository) GetEventsByStatusV1(
	ctx context.Context,
	status string,
	search string,
	page int,
	limit int,
) (*EventListV1Result, error) {
	// Validate and sanitize inputs
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}

	// Normalize status
	status = strings.ToLower(strings.TrimSpace(status))
	search = strings.TrimSpace(search)

	// ==================== STEP 1: BUILD WHERE CONDITIONS ====================

	var whereConditions []string
	var queryArgs []interface{}

	// Add status condition
	switch status {
	case "open", "today":
		whereConditions = append(whereConditions, "e.start_time <= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.end_time >= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")

	case "upcoming":
		whereConditions = append(whereConditions, "e.start_time > timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")

	case "past", "closed":
		whereConditions = append(whereConditions, "(e.end_time < timezone('Asia/Ho_Chi_Minh', NOW()) OR e.status = 'CLOSED') AND e.status != 'CANCELLED'")

	default:
		// Invalid status - default to today's events
		status = "open"
		whereConditions = append(whereConditions, "e.start_time <= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.end_time >= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")
	}

	// Add search condition
	if search != "" {
		searchPattern := "%" + search + "%"
		whereConditions = append(
			whereConditions,
			fmt.Sprintf("(e.title LIKE $%d OR va.area_name LIKE $%d OR v.venue_name LIKE $%d)", len(queryArgs)+1, len(queryArgs)+2, len(queryArgs)+3),
		)
		queryArgs = append(queryArgs, searchPattern, searchPattern, searchPattern)
	}

	// Join all conditions with AND
	whereClause := strings.Join(whereConditions, " AND ")

	// ==================== STEP 2: COUNT TOTAL MATCHING RECORDS ====================

	countQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT e.event_id)
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
	`, whereClause)

	var totalCount int
	err := r.db.QueryRowContext(ctx, countQuery, queryArgs...).Scan(&totalCount)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to count events: %w", err)
	}

	// If no results, return empty response
	if totalCount == 0 {
		return &EventListV1Result{
			Data:       []models.EventListItem{},
			Total:      0,
			Page:       page,
			Limit:      limit,
			TotalPages: 0,
		}, nil
	}

	// ==================== STEP 3: CALCULATE PAGINATION ====================

	offset := (page - 1) * limit
	totalPages := (totalCount + limit - 1) / limit

	// ==================== STEP 4: BUILD SMART SORTING ====================

	// Sort order depends on status for better UX:
	// - 'upcoming': Sort by start_time ASC (nearest events first)
	// - 'closed'/'past': Sort by end_time DESC (most recently ended first)
	// - 'open'/'today': Sort by start_time DESC (newer/later events first)
	var orderByClause string
	switch status {
	case "upcoming":
		orderByClause = "ORDER BY e.start_time ASC"
	case "past", "closed":
		orderByClause = "ORDER BY e.end_time DESC"
	default: // 'open', 'today'
		orderByClause = "ORDER BY e.start_time DESC"
	}

	// ==================== STEP 5: FETCH PAGINATED RESULTS ====================

	dataQuery := fmt.Sprintf(`
		SELECT 
			e.event_id,
			e.title,
			e.description,
			e.start_time,
			e.end_time,
			e.max_seats,
			e.status,
			e.banner_url,
			va.area_id,
			va.area_name,
			va.floor,
			v.venue_name,
			v.location,
			e.created_by,
			(SELECT COALESCE(COUNT(*), 0) FROM Ticket t WHERE t.event_id = e.event_id AND t.status IN ('PENDING', 'BOOKED', 'CHECKED_IN')) AS seats_booked,
			COALESCE(e.max_seats, 0) AS total_capacity
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
		%s
		LIMIT $%d OFFSET $%d
	`, whereClause, orderByClause, len(queryArgs)+1, len(queryArgs)+2)

	// Append pagination parameters
	paginationArgs := append(queryArgs, limit, offset)

	rows, err := r.db.QueryContext(ctx, dataQuery, paginationArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch events: %w", err)
	}
	defer rows.Close()

	var events []models.EventListItem

	for rows.Next() {
		var (
			eventID       int
			title         string
			description   sql.NullString
			startTime     time.Time
			endTime       time.Time
			maxSeats      int
			status        string
			bannerURL     sql.NullString
			areaID        sql.NullInt64
			areaName      sql.NullString
			floor         sql.NullString
			venueName     sql.NullString
			venueLocation sql.NullString
			organizerID   sql.NullInt64
			seatsBooked   sql.NullInt64
			totalCapacity sql.NullInt64
		)

		err := rows.Scan(
			&eventID,
			&title,
			&description,
			&startTime,
			&endTime,
			&maxSeats,
			&status,
			&bannerURL,
			&areaID,
			&areaName,
			&floor,
			&venueName,
			&venueLocation,
			&organizerID,
			&seatsBooked,
			&totalCapacity,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		event := models.EventListItem{
			EventID:       eventID,
			Title:         title,
			Description:   nullStringToPointer(description),
			// ✅ FIXED: Use FormatTimeToWallClockRFC3339 - formats wall-clock time directly without conversion
			StartTime:     utils.FormatTimeToWallClockRFC3339(startTime),
			EndTime:       utils.FormatTimeToWallClockRFC3339(endTime),
			MaxSeats:      maxSeats,
			Status:        status,
			BannerURL:     nullStringToPointer(bannerURL),
			AreaID:        nullInt64ToPointer(areaID),
			AreaName:      nullStringToPointer(areaName),
			Floor:         nullStringToPointer(floor),
			VenueName:     nullStringToPointer(venueName),
			VenueLocation: nullStringToPointer(venueLocation),
			OrganizerID:   nullInt64ToPointer(organizerID),
			SeatsBooked:   nullInt64ToPointer(seatsBooked),
			TotalCapacity: nullInt64ToPointer(totalCapacity),
		}

		events = append(events, event)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating events: %w", err)
	}

	// ==================== STEP 5: RETURN RESULT ====================

	result := &EventListV1Result{
		Data:       events,
		Total:      totalCount,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}

	return result, nil
}

// GetEventsByStatusV1WithRole - Same as GetEventsByStatusV1, but filters by organizer role
// For ORGANIZER role: Only return events created by that organizer
// For ADMIN role: Return all events
// For PUBLIC/GUEST: Return all public events
func (r *EventRepository) GetEventsByStatusV1WithRole(
	ctx context.Context,
	status string,
	search string,
	page int,
	limit int,
	role string,
	userID int,
) (*EventListV1Result, error) {
	// Validate and sanitize inputs
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	// Normalize status
	status = strings.ToLower(strings.TrimSpace(status))
	search = strings.TrimSpace(search)
	role = strings.ToUpper(strings.TrimSpace(role))

	// ==================== STEP 1: BUILD WHERE CONDITIONS ====================

	var whereConditions []string
	var queryArgs []interface{}

	// Add status condition
	switch status {
	case "open", "today":
		whereConditions = append(whereConditions, "e.start_time <= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.end_time >= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")

	case "upcoming":
		whereConditions = append(whereConditions, "e.start_time > timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")

	case "past", "closed":
		whereConditions = append(whereConditions, "(e.end_time < timezone('Asia/Ho_Chi_Minh', NOW()) OR e.status = 'CLOSED') AND e.status != 'CANCELLED'")

	default:
		// Invalid status - default to today's events
		status = "open"
		whereConditions = append(whereConditions, "e.start_time <= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.end_time >= timezone('Asia/Ho_Chi_Minh', NOW()) AND e.status = 'OPEN'")
	}

	// Add search condition
	if search != "" {
		searchPattern := "%" + search + "%"
		whereConditions = append(
			whereConditions,
			fmt.Sprintf("(e.title LIKE $%d OR va.area_name LIKE $%d OR v.venue_name LIKE $%d)", len(queryArgs)+1, len(queryArgs)+2, len(queryArgs)+3),
		)
		queryArgs = append(queryArgs, searchPattern, searchPattern, searchPattern)
	}

	// Add role-based filtering
	if role == "ORGANIZER" {
		whereConditions = append(whereConditions, fmt.Sprintf("e.created_by = $%d", len(queryArgs)+1))
		queryArgs = append(queryArgs, userID)
	}
	// If ADMIN or PUBLIC: no additional filter (show all)

	// Join all conditions with AND
	whereClause := strings.Join(whereConditions, " AND ")

	// ==================== STEP 2: COUNT TOTAL MATCHING RECORDS ====================

	countQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT e.event_id)
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
	`, whereClause)

	var totalCount int
	err := r.db.QueryRowContext(ctx, countQuery, queryArgs...).Scan(&totalCount)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to count events: %w", err)
	}

	// If no results, return empty response
	if totalCount == 0 {
		return &EventListV1Result{
			Data:       []models.EventListItem{},
			Total:      0,
			Page:       page,
			Limit:      limit,
			TotalPages: 0,
		}, nil
	}

	// ==================== STEP 3: CALCULATE PAGINATION ====================

	offset := (page - 1) * limit
	totalPages := (totalCount + limit - 1) / limit

	// ==================== STEP 4: BUILD SMART SORTING ====================

	// Sort order depends on status for better UX:
	// - 'upcoming': Sort by start_time ASC (nearest events first)
	// - 'closed'/'past': Sort by end_time DESC (most recently ended first)
	// - 'open'/'today': Sort by start_time DESC (newer/later events first)
	var orderByClause string
	switch status {
	case "upcoming":
		orderByClause = "ORDER BY e.start_time ASC"
	case "past", "closed":
		orderByClause = "ORDER BY e.end_time DESC"
	default: // 'open', 'today'
		orderByClause = "ORDER BY e.start_time DESC"
	}

	// ==================== STEP 5: FETCH PAGINATED RESULTS ====================

	dataQuery := fmt.Sprintf(`
		SELECT 
			e.event_id,
			e.title,
			e.description,
			e.start_time,
			e.end_time,
			e.max_seats,
			e.status,
			e.banner_url,
			va.area_id,
			va.area_name,
			va.floor,
			v.venue_name,
			v.location,
			e.created_by,
			(SELECT COALESCE(COUNT(*), 0) FROM Ticket t WHERE t.event_id = e.event_id AND t.status IN ('PENDING', 'BOOKED', 'CHECKED_IN')) AS seats_booked,
			COALESCE(e.max_seats, 0) AS total_capacity
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
		%s
		LIMIT $%d OFFSET $%d
	`, whereClause, orderByClause, len(queryArgs)+1, len(queryArgs)+2)

	// Append pagination parameters
	paginationArgs := append(queryArgs, limit, offset)

	rows, err := r.db.QueryContext(ctx, dataQuery, paginationArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch events: %w", err)
	}
	defer rows.Close()

	var events []models.EventListItem

	for rows.Next() {
		var (
			eventID       int
			title         string
			description   sql.NullString
			startTime     time.Time
			endTime       time.Time
			maxSeats      int
			status        string
			bannerURL     sql.NullString
			areaID        sql.NullInt64
			areaName      sql.NullString
			floor         sql.NullString
			venueName     sql.NullString
			venueLocation sql.NullString
			organizerID   sql.NullInt64
			seatsBooked   sql.NullInt64
			totalCapacity sql.NullInt64
		)

		err := rows.Scan(
			&eventID,
			&title,
			&description,
			&startTime,
			&endTime,
			&maxSeats,
			&status,
			&bannerURL,
			&areaID,
			&areaName,
			&floor,
			&venueName,
			&venueLocation,
			&organizerID,
			&seatsBooked,
			&totalCapacity,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		event := models.EventListItem{
			EventID:       eventID,
			Title:         title,
			Description:   nullStringToPointer(description),
			// ✅ FIXED: Use FormatTimeToWallClockRFC3339 - formats wall-clock time directly without conversion
			StartTime:     utils.FormatTimeToWallClockRFC3339(startTime),
			EndTime:       utils.FormatTimeToWallClockRFC3339(endTime),
			MaxSeats:      maxSeats,
			Status:        status,
			BannerURL:     nullStringToPointer(bannerURL),
			AreaID:        nullInt64ToPointer(areaID),
			AreaName:      nullStringToPointer(areaName),
			Floor:         nullStringToPointer(floor),
			VenueName:     nullStringToPointer(venueName),
			VenueLocation: nullStringToPointer(venueLocation),
			OrganizerID:   nullInt64ToPointer(organizerID),
			SeatsBooked:   nullInt64ToPointer(seatsBooked),
			TotalCapacity: nullInt64ToPointer(totalCapacity),
		}

		events = append(events, event)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating events: %w", err)
	}

	// ==================== STEP 6: RETURN RESULT ====================

	result := &EventListV1Result{
		Data:       events,
		Total:      totalCount,
		Page:       page,
		Limit:      limit,
		TotalPages: totalPages,
	}

	return result, nil
}

// GetEventsByStatusV1WithRole - Same as GetEventsByStatusV1, but filters by organizer role
// Helper functions
func nullStringToPointer(ns sql.NullString) *string {
	if ns.Valid {
		return &ns.String
	}
	return nil
}

func nullInt64ToPointer(ni sql.NullInt64) *int {
	if ni.Valid {
		intVal := int(ni.Int64)
		return &intVal
	}
	return nil
}
