package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/fpt-event-services/services/event-lambda/models"
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
//   - limit: items per page (default 10, max 100)
//
// Returns:
//   - Total count of matching events
//   - Paginated list of events
//   - Total pages
//
// Logic:
// 1. Build WHERE conditions based on status:
//   - 'open'/'today': status='OPEN' AND DATE(start_time) = CURDATE()
//     → Only shows today's events (server timezone)
//   - 'upcoming': status='OPEN' AND start_time > NOW()
//     → Shows future events
//   - 'past'/'closed': status='CLOSED' OR (status='OPEN' AND start_time < NOW())
//     → Shows past events (closed or old open events)
//  2. If search provided: AND (e.title LIKE ? OR va.area_name LIKE ? OR v.venue_name LIKE ?)
//     → Search is combined with status filter using AND
//  3. Calculate OFFSET = (page - 1) * limit
//  4. Run 2 queries:
//     - COUNT(DISTINCT e.event_id) for total matching records
//     - SELECT ... LIMIT ? OFFSET ? for paginated results
//  5. Return both total count and results
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
		limit = 10
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
		// Today's events: status = 'OPEN' AND start_time is TODAY
		// Using DATE(e.start_time) = CURDATE() ensures only today's events (server timezone)
		whereConditions = append(whereConditions, "e.status = ? AND DATE(e.start_time) = CURDATE()")
		queryArgs = append(queryArgs, "OPEN")

	case "upcoming":
		// Upcoming events: status = 'OPEN' AND start_time > NOW()
		whereConditions = append(whereConditions, "e.status = ? AND e.start_time > NOW()")
		queryArgs = append(queryArgs, "OPEN")

	case "past", "closed":
		// Past events: status = 'CLOSED' OR (status = 'OPEN' AND start_time < NOW())
		// Typically we use status = 'CLOSED', but include old OPEN events too
		whereConditions = append(whereConditions, "(e.status = ? OR (e.status = ? AND e.start_time < NOW()))")
		queryArgs = append(queryArgs, "CLOSED", "OPEN")

	default:
		// Invalid status - default to today's OPEN events
		status = "open"
		whereConditions = append(whereConditions, "e.status = ? AND DATE(e.start_time) = CURDATE()")
		queryArgs = append(queryArgs, "OPEN")
	}

	// Add search condition
	if search != "" {
		searchPattern := "%" + search + "%"
		whereConditions = append(
			whereConditions,
			"(e.title LIKE ? OR va.area_name LIKE ? OR v.venue_name LIKE ?)",
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

	// ==================== STEP 4: FETCH PAGINATED RESULTS ====================

	dataQuery := fmt.Sprintf(`
		SELECT 
			e.event_id,
			e.title,
			e.description,
			DATE_FORMAT(e.start_time, '%%Y-%%m-%%dT%%H:%%i:%%sZ') as start_time,
			DATE_FORMAT(e.end_time, '%%Y-%%m-%%dT%%H:%%i:%%sZ') as end_time,
			e.max_seats,
			e.status,
			e.banner_url,
			va.area_id,
			va.area_name,
			va.floor,
			v.venue_name,
			v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
		ORDER BY e.start_time DESC
		LIMIT ? OFFSET ?
	`, whereClause)

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
			startTime     string
			endTime       string
			maxSeats      int
			status        string
			bannerURL     sql.NullString
			areaID        sql.NullInt64
			areaName      sql.NullString
			floor         sql.NullString
			venueName     sql.NullString
			venueLocation sql.NullString
			organizerID   sql.NullInt64
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
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		event := models.EventListItem{
			EventID:       eventID,
			Title:         title,
			Description:   nullStringToPointer(description),
			StartTime:     startTime,
			EndTime:       endTime,
			MaxSeats:      maxSeats,
			Status:        status,
			BannerURL:     nullStringToPointer(bannerURL),
			AreaID:        nullInt64ToPointer(areaID),
			AreaName:      nullStringToPointer(areaName),
			Floor:         nullStringToPointer(floor),
			VenueName:     nullStringToPointer(venueName),
			VenueLocation: nullStringToPointer(venueLocation),
			OrganizerID:   nullInt64ToPointer(organizerID),
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
		// Today's events: status = 'OPEN' AND start_time is TODAY
		whereConditions = append(whereConditions, "e.status = ? AND DATE(e.start_time) = CURDATE()")
		queryArgs = append(queryArgs, "OPEN")

	case "upcoming":
		whereConditions = append(whereConditions, "e.status = ? AND e.start_time > NOW()")
		queryArgs = append(queryArgs, "OPEN")

	case "past", "closed":
		whereConditions = append(whereConditions, "(e.status = ? OR (e.status = ? AND e.start_time < NOW()))")
		queryArgs = append(queryArgs, "CLOSED", "OPEN")

	default:
		// Invalid status - default to today's OPEN events with date filter
		status = "open"
		whereConditions = append(whereConditions, "e.status = ? AND DATE(e.start_time) = CURDATE()")
		queryArgs = append(queryArgs, "OPEN")
	}

	// Add search condition
	if search != "" {
		searchPattern := "%" + search + "%"
		whereConditions = append(
			whereConditions,
			"(e.title LIKE ? OR va.area_name LIKE ? OR v.venue_name LIKE ?)",
		)
		queryArgs = append(queryArgs, searchPattern, searchPattern, searchPattern)
	}

	// Add role-based filtering
	if role == "ORGANIZER" {
		whereConditions = append(whereConditions, "e.created_by = ?")
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

	// ==================== STEP 4: FETCH PAGINATED RESULTS ====================

	dataQuery := fmt.Sprintf(`
		SELECT 
			e.event_id,
			e.title,
			e.description,
			DATE_FORMAT(e.start_time, '%%Y-%%m-%%dT%%H:%%i:%%sZ') as start_time,
			DATE_FORMAT(e.end_time, '%%Y-%%m-%%dT%%H:%%i:%%sZ') as end_time,
			e.max_seats,
			e.status,
			e.banner_url,
			va.area_id,
			va.area_name,
			va.floor,
			v.venue_name,
			v.location,
			e.created_by
		FROM Event e
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		WHERE %s
		ORDER BY e.start_time DESC
		LIMIT ? OFFSET ?
	`, whereClause)

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
			startTime     string
			endTime       string
			maxSeats      int
			eventStatus   string
			bannerURL     sql.NullString
			areaID        sql.NullInt64
			areaName      sql.NullString
			floor         sql.NullString
			venueName     sql.NullString
			venueLocation sql.NullString
			organizerID   sql.NullInt64
		)

		err := rows.Scan(
			&eventID,
			&title,
			&description,
			&startTime,
			&endTime,
			&maxSeats,
			&eventStatus,
			&bannerURL,
			&areaID,
			&areaName,
			&floor,
			&venueName,
			&venueLocation,
			&organizerID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		event := models.EventListItem{
			EventID:       eventID,
			Title:         title,
			Description:   nullStringToPointer(description),
			StartTime:     startTime,
			EndTime:       endTime,
			MaxSeats:      maxSeats,
			Status:        eventStatus,
			BannerURL:     nullStringToPointer(bannerURL),
			AreaID:        nullInt64ToPointer(areaID),
			AreaName:      nullStringToPointer(areaName),
			Floor:         nullStringToPointer(floor),
			VenueName:     nullStringToPointer(venueName),
			VenueLocation: nullStringToPointer(venueLocation),
			OrganizerID:   nullInt64ToPointer(organizerID),
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
