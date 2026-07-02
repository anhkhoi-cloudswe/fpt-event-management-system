package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/event-service/models"
)

// ============================================================
// Event API Composition - Phase 3: Microservices Migration
//
// Thay thế tất cả SQL JOINs chéo domain (Venue_Area, Venue, Users, Ticket)
// bằng Internal API Calls.
//
// Nguyên tắc:
//   1. JSON response cho Frontend KHÔNG THAY ĐỔI
//   2. Chỉ cách lấy dữ liệu thay đổi (SQL JOIN → API Call)
//   3. Có fallback về monolith mode nếu API call thất bại
//
// Internal APIs sử dụng:
//   - GET /internal/venue/area-with-venue?areaId=  → Thay JOIN Venue_Area + Venue
//   - POST /internal/venue/area-status             → Thay UPDATE Venue_Area trực tiếp
//   - GET /internal/user/profile?userId=           → Thay JOIN Users
//   - GET /internal/user/profiles?userIds=1,2,3    → Batch user lookup
//   - GET /internal/ticket/count?eventId=          → Thay JOIN Ticket cho stats
// ============================================================

// ============================================================
// API Response DTOs - Cấu trúc dữ liệu nhận từ Internal APIs
// ============================================================

// AreaWithVenueDTO - Response từ /internal/venue/area-with-venue
type AreaWithVenueDTO struct {
	AreaID        int     `json:"areaId"`
	AreaName      string  `json:"areaName"`
	Floor         *string `json:"floor"`
	Capacity      *int    `json:"capacity"`
	VenueID       int     `json:"venueId"`
	Status        string  `json:"status"`
	VenueName     *string `json:"venueName"`
	VenueLocation *string `json:"venueLocation"`
}

// UserProfileDTO - Response từ /internal/user/profile
type UserProfileDTO struct {
	UserID   int    `json:"userId"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
}

// TicketStatsDTO - Response từ /internal/ticket/count
type TicketStatsDTO struct {
	TotalTickets    int     `json:"totalTickets"`
	CheckedInCount  int     `json:"totalCheckedIn"`
	CheckedOutCount int     `json:"totalCheckedOut"`
	BookedCount     int     `json:"bookedCount"`
	CancelledCount  int     `json:"cancelledCount"`
	RefundedCount   int     `json:"totalRefunded"`
	TotalRevenue    float64 `json:"totalRevenue"`
}

// AreaStatusRequest - Request cho POST /internal/venue/area-status
type AreaStatusRequest struct {
	AreaID int    `json:"areaId"`
	Status string `json:"status"`
}

// ============================================================
// Internal API Client Helpers
// ============================================================

var internalClient *utils.InternalClient

func getInternalClient() *utils.InternalClient {
	if internalClient == nil {
		internalClient = utils.NewInternalClient()
	}
	return internalClient
}

// fetchAreaWithVenue gọi /internal/venue/area-with-venue?areaId=
func fetchAreaWithVenue(ctx context.Context, areaID int) (*AreaWithVenueDTO, error) {
	client := getInternalClient()
	baseURL := utils.GetVenueServiceURL() + "/internal/venue/area-with-venue"

	var result AreaWithVenueDTO
	statusCode, err := client.GetJSON(ctx, baseURL, map[string]string{
		"areaId": strconv.Itoa(areaID),
	}, &result)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch area-with-venue for areaId=%d: %w", areaID, err)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("area-with-venue returned status %d for areaId=%d", statusCode, areaID)
	}

	return &result, nil
}

// fetchUserProfile gọi /internal/user/profile?userId=
func fetchUserProfile(ctx context.Context, userID int) (*UserProfileDTO, error) {
	client := getInternalClient()
	baseURL := utils.GetAuthServiceURL() + "/internal/user/profile"

	var result UserProfileDTO
	statusCode, err := client.GetJSON(ctx, baseURL, map[string]string{
		"userId": strconv.Itoa(userID),
	}, &result)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch user profile for userId=%d: %w", userID, err)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("user profile returned status %d for userId=%d", statusCode, userID)
	}

	return &result, nil
}

// fetchUserProfiles gọi /internal/user/profiles?userIds=1,2,3 (batch lookup)
func fetchUserProfiles(ctx context.Context, userIDs []int) (map[int]*UserProfileDTO, error) {
	if len(userIDs) == 0 {
		return make(map[int]*UserProfileDTO), nil
	}

	// Deduplicate userIDs
	seen := make(map[int]bool)
	var uniqueIDs []string
	for _, id := range userIDs {
		if id > 0 && !seen[id] {
			seen[id] = true
			uniqueIDs = append(uniqueIDs, strconv.Itoa(id))
		}
	}

	if len(uniqueIDs) == 0 {
		return make(map[int]*UserProfileDTO), nil
	}

	client := getInternalClient()
	baseURL := utils.GetAuthServiceURL() + "/internal/user/profiles"

	// Join IDs with comma
	idsStr := ""
	for i, id := range uniqueIDs {
		if i > 0 {
			idsStr += ","
		}
		idsStr += id
	}

	var profiles []UserProfileDTO
	statusCode, err := client.GetJSON(ctx, baseURL, map[string]string{
		"userIds": idsStr,
	}, &profiles)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch user profiles: %w", err)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("user profiles returned status %d", statusCode)
	}

	// Build lookup map
	result := make(map[int]*UserProfileDTO)
	for i := range profiles {
		result[profiles[i].UserID] = &profiles[i]
	}

	return result, nil
}

// fetchTicketStats gọi /internal/ticket/count?eventId=
func fetchTicketStats(ctx context.Context, eventID int) (*TicketStatsDTO, error) {
	client := getInternalClient()
	baseURL := utils.GetTicketServiceURL() + "/internal/ticket/count"

	params := map[string]string{}
	if eventID > 0 {
		params["eventId"] = strconv.Itoa(eventID)
	}

	var result TicketStatsDTO
	statusCode, err := client.GetJSON(ctx, baseURL, params, &result)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch ticket stats for eventId=%d: %w", eventID, err)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("ticket stats returned status %d for eventId=%d", statusCode, eventID)
	}

	return &result, nil
}

// fetchAggregateTicketStats gọi /internal/ticket/count (aggregate, optional organizerId)
func fetchAggregateTicketStats(ctx context.Context, organizerID *int) (*TicketStatsDTO, error) {
	client := getInternalClient()
	baseURL := utils.GetTicketServiceURL() + "/internal/ticket/count"

	params := map[string]string{}
	if organizerID != nil {
		params["organizerId"] = strconv.Itoa(*organizerID)
	}

	var result TicketStatsDTO
	statusCode, err := client.GetJSON(ctx, baseURL, params, &result)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch aggregate ticket stats: %w", err)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("aggregate ticket stats returned status %d", statusCode)
	}

	return &result, nil
}

// updateAreaStatusViaAPI gọi POST /internal/venue/area-status
func updateAreaStatusViaAPI(ctx context.Context, areaID int, status string) error {
	client := getInternalClient()
	url := utils.GetVenueServiceURL() + "/internal/venue/area-status"

	reqBody := AreaStatusRequest{
		AreaID: areaID,
		Status: status,
	}

	body, statusCode, err := client.Post(ctx, url, reqBody)
	if err != nil {
		return fmt.Errorf("failed to update area %d status to %s: %w", areaID, status, err)
	}

	if statusCode != 200 {
		return fmt.Errorf("area-status API returned status %d for areaId=%d: %s", statusCode, areaID, string(body))
	}

	// Verify response
	var response struct {
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(body, &response); err == nil && !response.Success {
		return fmt.Errorf("area-status API returned success=false for areaId=%d", areaID)
	}

	log.Printf("[API_COMPOSITION] ✅ Updated area %d status to %s via API", areaID, status)
	return nil
}

// ============================================================
// Composed Functions - Thay thế SQL JOINs bằng API Calls
// ============================================================

// GetAllEventsSeparatedComposed - Thay thế JOIN Venue_Area + Venue bằng API calls
func (r *EventRepository) GetAllEventsSeparatedComposed(ctx context.Context, role string, userID int) ([]models.EventListItem, []models.EventListItem, error) {
	log.Printf("[API_COMPOSITION] GetAllEventsSeparatedComposed: role=%s, userID=%d", role, userID)

	// Query chỉ bảng Event (không JOIN Venue_Area/Venue)
	baseQuery := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, e.created_by
		FROM Event e
	`

	var query string
	var args []interface{}

	if role == "ORGANIZER" {
		query = baseQuery + ` WHERE e.created_by = $1 AND (e.status IN ('OPEN','CLOSED','UPDATING','FINISHED') OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
		args = append(args, userID)
	} else if role == "STAFF" {
		query = baseQuery + ` WHERE (e.status = 'OPEN' OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
	} else {
		query = baseQuery + ` WHERE (e.status = 'OPEN' OR e.end_time < NOW())
			ORDER BY e.start_time DESC`
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	// Collect raw event data + area IDs để batch lookup
	type rawEvent struct {
		item      models.EventListItem
		areaID    sql.NullInt64
		createdBy sql.NullInt64
		endTime   time.Time
	}

	var rawEvents []rawEvent
	areaIDSet := make(map[int]bool)

	for rows.Next() {
		var re rawEvent
		var description, bannerURL sql.NullString
		var startTime, endTime time.Time

		err := rows.Scan(
			&re.item.EventID, &re.item.Title, &description, &startTime, &endTime,
			&re.item.MaxSeats, &re.item.Status, &bannerURL,
			&re.areaID, &re.createdBy,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to scan event: %w", err)
		}

		re.item.StartTime = utils.FormatTimeToWallClockRFC3339(startTime)
		re.item.EndTime = utils.FormatTimeToWallClockRFC3339(endTime)
		re.endTime = endTime

		if description.Valid {
			re.item.Description = &description.String
		}
		if bannerURL.Valid {
			re.item.BannerURL = &bannerURL.String
		}
		if re.areaID.Valid {
			re.item.AreaID = pointer(int(re.areaID.Int64))
			areaIDSet[int(re.areaID.Int64)] = true
		}
		if re.createdBy.Valid {
			re.item.OrganizerID = pointer(int(re.createdBy.Int64))
		}

		rawEvents = append(rawEvents, re)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Batch fetch area+venue info for all unique area IDs
	areaCache := make(map[int]*AreaWithVenueDTO)
	for areaID := range areaIDSet {
		areaInfo, err := fetchAreaWithVenue(ctx, areaID)
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch area %d: %v (continuing with nil)", areaID, err)
			continue
		}
		areaCache[areaID] = areaInfo
	}

	log.Printf("[API_COMPOSITION] Fetched %d area infos via API", len(areaCache))

	// Enrich events with area+venue info
	var openEvents, closedEvents []models.EventListItem
	now := utils.NowInVietnam()

	for _, re := range rawEvents {
		item := re.item

		if re.areaID.Valid {
			areaID := int(re.areaID.Int64)
			if areaInfo, ok := areaCache[areaID]; ok {
				item.AreaName = &areaInfo.AreaName
				item.Floor = areaInfo.Floor
				if areaInfo.VenueName != nil {
					item.VenueName = areaInfo.VenueName
				}
				if areaInfo.VenueLocation != nil {
					item.VenueLocation = areaInfo.VenueLocation
				}
			}
		}

		if item.Status == "CLOSED" || re.endTime.Before(now) {
			closedEvents = append(closedEvents, item)
		} else {
			openEvents = append(openEvents, item)
		}
	}

	log.Printf("[API_COMPOSITION] ✅ GetAllEventsSeparated: open=%d, closed=%d", len(openEvents), len(closedEvents))
	return openEvents, closedEvents, nil
}

// GetAllEventsSeparatedWithPaginationComposed - Composed variant for paginated event listing.
// Pagination is SQL-based so this delegates directly to the SQL implementation.
// No API composition is needed for pagination (venue data is already JOIN-ed in SQL).
func (r *EventRepository) GetAllEventsSeparatedWithPaginationComposed(ctx context.Context, role string, userID int, page int, limit int) (
	[]models.EventListItem,
	[]models.EventListItem,
	[]models.EventListItem,
	int, // totalOpen
	int, // totalClosed
	int, // totalCancelled
	error,
) {
	log.Printf("[API_COMPOSITION] GetAllEventsSeparatedWithPaginationComposed: role=%s, userID=%d, page=%d, limit=%d", role, userID, page, limit)
	// Safe to call: GetAllEventsSeparatedWithPagination no longer routes through Composed
	return r.GetAllEventsSeparatedWithPagination(ctx, role, userID, page, limit)
}

// GetEventDetailComposed - Thay thế JOIN Venue_Area + Venue + Speaker bằng API calls
// NOTE: Speaker vẫn JOIN vì Speaker là domain con của Event
func (r *EventRepository) GetEventDetailComposed(ctx context.Context, eventID int) (*models.EventDetailDto, error) {
	log.Printf("[API_COMPOSITION] GetEventDetailComposed: eventID=%d", eventID)

	{
		detail, areaID, speakerID, err := r.loadEventDetailCore(ctx, eventID)
		if err != nil || detail == nil {
			return detail, err
		}

		if err := r.loadEventDetailSpeaker(ctx, detail, speakerID); err != nil {
			return nil, err
		}

		if areaID.Valid {
			aid := int(areaID.Int64)
			detail.AreaID = &aid

			areaInfo, err := fetchAreaWithVenue(ctx, aid)
			if err != nil {
				log.Printf("[API_COMPOSITION] Failed to fetch area %d: %v", aid, err)
			} else {
				detail.AreaName = &areaInfo.AreaName
				detail.Floor = areaInfo.Floor
				if areaInfo.Capacity != nil {
					detail.AreaCapacity = areaInfo.Capacity
				}
				if areaInfo.VenueName != nil {
					detail.VenueName = areaInfo.VenueName
				}
				if areaInfo.VenueLocation != nil {
					detail.VenueLocation = areaInfo.VenueLocation
				}
			}
		}

		if err := r.loadEventDetailCollections(ctx, detail, eventID); err != nil {
			return nil, err
		}

		log.Printf("[API_COMPOSITION] GetEventDetail: eventID=%d, venue=%v", eventID, detail.VenueName)
		return detail, nil
	}

	// Query Event + Speaker ONLY (Speaker thuộc Event domain)
	query := `
		SELECT
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id,
			e.speaker_id, s.full_name, s.bio, s.avatar_url, s.email, s.phone
		FROM Event e
		LEFT JOIN Speaker s ON e.speaker_id = s.speaker_id
		WHERE e.event_id = $1
	`

	var detail models.EventDetailDto
	var description, bannerURL, speakerName, speakerBio, speakerAvatar, speakerEmail, speakerPhone sql.NullString
	var areaID sql.NullInt64
	var speakerID sql.NullInt64
	var startTime, endTime time.Time
	var maxSeats sql.NullInt64
	var status sql.NullString

	err := r.db.QueryRowContext(ctx, query, eventID).Scan(
		&detail.EventID, &detail.Title, &description, &startTime, &endTime, &maxSeats, &status, &bannerURL,
		&areaID,
		&speakerID, &speakerName, &speakerBio, &speakerAvatar, &speakerEmail, &speakerPhone,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query event detail: %w", err)
	}

	// Map basic fields
	if description.Valid {
		detail.Description = &description.String
	}
	detail.StartTime = formatTimeToWallClockRFC3339(startTime)
	detail.EndTime = formatTimeToWallClockRFC3339(endTime)
	if maxSeats.Valid {
		detail.MaxSeats = int(maxSeats.Int64)
	}
	if status.Valid {
		detail.Status = status.String
	}
	if bannerURL.Valid {
		detail.BannerURL = &bannerURL.String
	}
	if speakerName.Valid {
		detail.SpeakerName = &speakerName.String
	}
	if speakerBio.Valid {
		detail.SpeakerBio = &speakerBio.String
	}
	if speakerAvatar.Valid {
		detail.SpeakerAvatarURL = &speakerAvatar.String
	}
	if speakerEmail.Valid {
		detail.SpeakerEmail = &speakerEmail.String
	}
	if speakerPhone.Valid {
		detail.SpeakerPhone = &speakerPhone.String
	}

	// Fetch area + venue info via API (thay thế JOIN Venue_Area + Venue)
	if areaID.Valid {
		aid := int(areaID.Int64)
		detail.AreaID = &aid

		areaInfo, err := fetchAreaWithVenue(ctx, aid)
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch area %d: %v", aid, err)
		} else {
			detail.AreaName = &areaInfo.AreaName
			detail.Floor = areaInfo.Floor
			if areaInfo.Capacity != nil {
				detail.AreaCapacity = areaInfo.Capacity
			}
			if areaInfo.VenueName != nil {
				detail.VenueName = areaInfo.VenueName
			}
		}
	}

	// Load tickets (same domain - no change)
	tickets, err := r.GetCategoryTicketsByEventID(ctx, eventID)
	if err != nil {
		return nil, fmt.Errorf("failed to load category tickets: %w", err)
	}
	detail.Tickets = tickets

	// Load seats by area_id (must include all seats in this area)
	if detail.AreaID != nil {
		seats, err := r.GetSeatsByAreaID(ctx, *detail.AreaID, eventID)
		if err != nil {
			return nil, fmt.Errorf("failed to load seats: %w", err)
		}
		detail.Seats = seats
	} else {
		detail.Seats = []models.SeatResponse{}
	}

	// Check bookings (same domain - no change)
	var bookingCount int
	err = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM Ticket WHERE event_id = $1 AND status IN ('PENDING','BOOKED','CHECKED_IN')", eventID).Scan(&bookingCount)
	if err == nil {
		has := bookingCount > 0
		detail.HasBookings = &has
	}

	log.Printf("[API_COMPOSITION] ✅ GetEventDetail: eventID=%d, venue=%v", eventID, detail.VenueName)
	return &detail, nil
}

// GetOpenEventsComposed - Thay thế JOIN Venue_Area + Venue bằng API calls
func (r *EventRepository) GetOpenEventsComposed(ctx context.Context) ([]models.EventListItem, error) {
	log.Printf("[API_COMPOSITION] GetOpenEventsComposed")

	// Query chỉ bảng Event (không JOIN)
	query := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, e.created_by
		FROM Event e
		WHERE e.status = 'OPEN'
		ORDER BY e.start_time DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query open events: %w", err)
	}
	defer rows.Close()

	type rawEvent struct {
		item   models.EventListItem
		areaID sql.NullInt64
	}

	var rawEvents []rawEvent
	areaIDSet := make(map[int]bool)

	for rows.Next() {
		var re rawEvent
		var description, bannerURL sql.NullString
		var createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&re.item.EventID, &re.item.Title, &description, &startTime, &endTime,
			&re.item.MaxSeats, &re.item.Status, &bannerURL,
			&re.areaID, &createdBy,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan event: %w", err)
		}

		re.item.StartTime = formatTimeToWallClockRFC3339(startTime)
		re.item.EndTime = formatTimeToWallClockRFC3339(endTime)

		if description.Valid {
			re.item.Description = &description.String
		}
		if bannerURL.Valid {
			re.item.BannerURL = &bannerURL.String
		}
		if re.areaID.Valid {
			re.item.AreaID = pointer(int(re.areaID.Int64))
			areaIDSet[int(re.areaID.Int64)] = true
		}
		if createdBy.Valid {
			re.item.OrganizerID = pointer(int(createdBy.Int64))
		}

		rawEvents = append(rawEvents, re)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Batch fetch area+venue info
	areaCache := make(map[int]*AreaWithVenueDTO)
	for areaID := range areaIDSet {
		areaInfo, err := fetchAreaWithVenue(ctx, areaID)
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch area %d: %v", areaID, err)
			continue
		}
		areaCache[areaID] = areaInfo
	}

	// Enrich
	var items []models.EventListItem
	for _, re := range rawEvents {
		item := re.item

		if re.areaID.Valid {
			areaID := int(re.areaID.Int64)
			if areaInfo, ok := areaCache[areaID]; ok {
				item.AreaName = &areaInfo.AreaName
				item.Floor = areaInfo.Floor
				if areaInfo.VenueName != nil {
					item.VenueName = areaInfo.VenueName
				}
				if areaInfo.VenueLocation != nil {
					item.VenueLocation = areaInfo.VenueLocation
				}
			}
		}

		items = append(items, item)
	}

	log.Printf("[API_COMPOSITION] ✅ GetOpenEvents: count=%d", len(items))
	return items, nil
}

// GetOpenEventsComposedWithPagination - OPEN events with pagination (API composition mode)
func (r *EventRepository) GetOpenEventsComposedWithPagination(ctx context.Context, page int, limit int) ([]models.EventListItem, int, error) {
	log.Printf("[API_COMPOSITION] GetOpenEventsComposedWithPagination")

	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 12
	}
	if limit > 100 {
		limit = 100
	}

	offset := (page - 1) * limit

	countQuery := `
		SELECT COUNT(*)
		FROM Event e
		WHERE e.status = 'OPEN'
	`

	var totalCount int
	if err := r.db.QueryRowContext(ctx, countQuery).Scan(&totalCount); err != nil && err != sql.ErrNoRows {
		return nil, 0, fmt.Errorf("failed to count open events: %w", err)
	}

	query := `
		SELECT 
			e.event_id, e.title, e.description, e.start_time, e.end_time, e.max_seats, e.status, e.banner_url,
			e.area_id, e.created_by
		FROM Event e
		WHERE e.status = 'OPEN'
		ORDER BY e.start_time DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query open events: %w", err)
	}
	defer rows.Close()

	type rawEvent struct {
		item   models.EventListItem
		areaID sql.NullInt64
	}

	var rawEvents []rawEvent
	areaIDSet := make(map[int]bool)

	for rows.Next() {
		var re rawEvent
		var description, bannerURL sql.NullString
		var createdBy sql.NullInt64
		var startTime, endTime time.Time

		err := rows.Scan(
			&re.item.EventID, &re.item.Title, &description, &startTime, &endTime,
			&re.item.MaxSeats, &re.item.Status, &bannerURL,
			&re.areaID, &createdBy,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan event: %w", err)
		}

		re.item.StartTime = formatTimeToWallClockRFC3339(startTime)
		re.item.EndTime = formatTimeToWallClockRFC3339(endTime)

		if description.Valid {
			re.item.Description = &description.String
		}
		if bannerURL.Valid {
			re.item.BannerURL = &bannerURL.String
		}
		if re.areaID.Valid {
			re.item.AreaID = pointer(int(re.areaID.Int64))
			areaIDSet[int(re.areaID.Int64)] = true
		}
		if createdBy.Valid {
			re.item.OrganizerID = pointer(int(createdBy.Int64))
		}

		rawEvents = append(rawEvents, re)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	areaCache := make(map[int]*AreaWithVenueDTO)
	for areaID := range areaIDSet {
		areaInfo, err := fetchAreaWithVenue(ctx, areaID)
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch area %d: %v", areaID, err)
			continue
		}
		areaCache[areaID] = areaInfo
	}

	var items []models.EventListItem
	for _, re := range rawEvents {
		item := re.item
		if re.areaID.Valid {
			areaID := int(re.areaID.Int64)
			if areaInfo, ok := areaCache[areaID]; ok {
				item.AreaName = &areaInfo.AreaName
				item.Floor = areaInfo.Floor
				if areaInfo.VenueName != nil {
					item.VenueName = areaInfo.VenueName
				}
				if areaInfo.VenueLocation != nil {
					item.VenueLocation = areaInfo.VenueLocation
				}
			}
		}

		items = append(items, item)
	}

	log.Printf("[API_COMPOSITION] ✅ GetOpenEventsWithPagination: count=%d", len(items))
	return items, totalCount, nil
}

// ============================================================
// Event Request Composed Functions - Thay JOIN Users + Venue bằng API
// ============================================================

// enrichEventRequestsWithAPI - Helper để enrich danh sách EventRequest bằng API calls
// Thay thế JOIN Users (requester_name, processed_by_name) và JOIN Venue_Area + Venue
func (r *EventRepository) enrichEventRequestsWithAPI(ctx context.Context, requests []models.EventRequest) error {
	if len(requests) == 0 {
		return nil
	}

	// Collect all user IDs cần lookup
	var userIDs []int
	// Collect all area IDs cần lookup (from created events)
	areaIDSet := make(map[int]bool)
	eventIDToAreaID := make(map[int]int) // eventID → areaID (để map lại)

	for _, req := range requests {
		if req.RequesterID > 0 {
			userIDs = append(userIDs, req.RequesterID)
		}
		if req.ProcessedBy != nil && *req.ProcessedBy > 0 {
			userIDs = append(userIDs, *req.ProcessedBy)
		}
	}

	// Batch fetch user profiles
	userMap, err := fetchUserProfiles(ctx, userIDs)
	if err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ Failed to batch fetch users: %v (continuing without user names)", err)
		userMap = make(map[int]*UserProfileDTO)
	}

	log.Printf("[API_COMPOSITION] Fetched %d user profiles via API", len(userMap))

	// For requests with created events, we need area+venue info
	// First collect event IDs that have created_event_id
	var eventIDs []int
	for _, req := range requests {
		if req.CreatedEventID != nil && *req.CreatedEventID > 0 {
			eventIDs = append(eventIDs, *req.CreatedEventID)
		}
	}

	// Batch lookup area_id for events (single-table Event query - same domain)
	if len(eventIDs) > 0 {
		for _, eid := range eventIDs {
			var areaID sql.NullInt64
			err := r.db.QueryRowContext(ctx, "SELECT area_id FROM Event WHERE event_id = $1", eid).Scan(&areaID)
			if err == nil && areaID.Valid {
				aid := int(areaID.Int64)
				eventIDToAreaID[eid] = aid
				areaIDSet[aid] = true
			}
		}
	}

	// Batch fetch area+venue info via API
	areaCache := make(map[int]*AreaWithVenueDTO)
	for areaID := range areaIDSet {
		areaInfo, err := fetchAreaWithVenue(ctx, areaID)
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch area %d: %v", areaID, err)
			continue
		}
		areaCache[areaID] = areaInfo
	}

	// Enrich requests
	for i := range requests {
		// Enrich requester name
		if profile, ok := userMap[requests[i].RequesterID]; ok {
			requests[i].RequesterName = &profile.FullName
		}

		// Enrich processed_by name
		if requests[i].ProcessedBy != nil {
			if profile, ok := userMap[*requests[i].ProcessedBy]; ok {
				requests[i].ProcessedByName = &profile.FullName
			}
		}

		// Enrich venue info from created event
		if requests[i].CreatedEventID != nil {
			if areaID, ok := eventIDToAreaID[*requests[i].CreatedEventID]; ok {
				if areaInfo, ok := areaCache[areaID]; ok {
					requests[i].VenueName = areaInfo.VenueName
					areaName := areaInfo.AreaName
					requests[i].AreaName = &areaName
					requests[i].Floor = areaInfo.Floor
					requests[i].AreaCapacity = areaInfo.Capacity
				}
			}
		}
	}

	return nil
}

// GetMyEventRequestsComposed - Thay thế tất cả JOINs bằng API calls
func (r *EventRepository) GetMyEventRequestsComposed(ctx context.Context, requesterID int) ([]models.EventRequest, error) {
	log.Printf("[API_COMPOSITION] GetMyEventRequestsComposed: requesterID=%d", requesterID)

	// Query chỉ bảng Event_Request + Event (cho event_status)
	query := `
		SELECT 
			er.request_id, er.requester_id,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		WHERE er.requester_id = $1
		ORDER BY er.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID)
	if err != nil {
		return nil, fmt.Errorf("failed to query event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating event requests: %w", err)
	}
	rows.Close() // Close rows early to release DB connection back to pool before internal API calls

	// Enrich with API calls
	if err := r.enrichEventRequestsWithAPI(ctx, requests); err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ enrichEventRequestsWithAPI failed: %v", err)
	}

	log.Printf("[API_COMPOSITION] ✅ GetMyEventRequests: count=%d", len(requests))
	return requests, nil
}

// GetMyActiveEventRequestsComposed - Active requests với API enrichment
func (r *EventRepository) GetMyActiveEventRequestsComposed(ctx context.Context, requesterID int, limit int, offset int) ([]models.EventRequest, int, error) {
	log.Printf("[API_COMPOSITION] GetMyActiveEventRequestsComposed: requesterID=%d", requesterID)

	query := `
		SELECT 
			er.request_id, er.requester_id,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id, e.status as event_status,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status = 'PENDING' OR (er.status = 'APPROVED' AND e.status = 'UPDATING'))
		ORDER BY er.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query active event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID, &eventStatus,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if eventStatus.Valid {
			req.EventStatus = &eventStatus.String
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating active event requests: %w", err)
	}
	rows.Close() // Close rows early to release DB connection back to pool before internal API calls

	// Enrich with API calls (Users + Venue)
	if err := r.enrichEventRequestsWithAPI(ctx, requests); err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ enrichEventRequestsWithAPI failed: %v", err)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status = 'PENDING' OR (er.status = 'APPROVED' AND e.status = 'UPDATING'))
	`
	var total int
	err = r.db.QueryRowContext(ctx, countQuery, requesterID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get active request count: %w", err)
	}

	return requests, total, nil
}

// GetMyArchivedEventRequestsComposed - Archived requests với API enrichment
func (r *EventRepository) GetMyArchivedEventRequestsComposed(ctx context.Context, requesterID int, limit int, offset int) ([]models.EventRequest, int, error) {
	log.Printf("[API_COMPOSITION] GetMyArchivedEventRequestsComposed: requesterID=%d", requesterID)

	query := `
		SELECT 
			er.request_id, er.requester_id,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id, e.status as event_status,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status IN ('REJECTED', 'CANCELLED') 
		       OR (er.status = 'APPROVED' AND e.status IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED')))
		ORDER BY er.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.QueryContext(ctx, query, requesterID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query archived event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var eventStatus sql.NullString
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID, &eventStatus,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		if eventStatus.Valid {
			req.EventStatus = &eventStatus.String
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating archived event requests: %w", err)
	}
	rows.Close() // Close rows early to release DB connection back to pool before internal API calls

	// Enrich with API calls
	if err := r.enrichEventRequestsWithAPI(ctx, requests); err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ enrichEventRequestsWithAPI failed: %v", err)
	}

	// Get total count
	countQuery := `
		SELECT COUNT(*) 
		FROM Event_Request er
		LEFT JOIN Event e ON er.created_event_id = e.event_id
		WHERE er.requester_id = $1 
		  AND (er.status IN ('REJECTED', 'CANCELLED') 
		       OR (er.status = 'APPROVED' AND e.status IN ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED')))
	`
	var total int
	err = r.db.QueryRowContext(ctx, countQuery, requesterID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get archived request count: %w", err)
	}

	return requests, total, nil
}

// GetPendingEventRequestsComposed - Staff view requests với API enrichment
func (r *EventRepository) GetPendingEventRequestsComposed(ctx context.Context) ([]models.EventRequest, error) {
	log.Printf("[API_COMPOSITION] GetPendingEventRequestsComposed")

	query := `
		SELECT 
			er.request_id, er.requester_id,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			er.event_format, er.custom_venue_name, er.custom_location,
			er.org_type, er.privacy_status,
			er.online_meeting_url, er.online_meeting_id, er.online_meeting_secret,
			er.banner_url
		FROM Event_Request er
		WHERE er.status IN ('PENDING', 'UPDATING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FINISHED')
		ORDER BY er.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending event requests: %w", err)
	}
	defer rows.Close()

	var requests []models.EventRequest
	for rows.Next() {
		var req models.EventRequest
		var processedBy sql.NullInt64
		var preferredStartTime, preferredEndTime sql.NullTime
		var processedAt, createdAt sql.NullTime
		var description, organizerNote, rejectReason sql.NullString
		var expectedCapacity, createdEventID sql.NullInt64
		var eventFormat, customVenueName, customLocation sql.NullString
		var orgType, privacyStatus sql.NullString
		var onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString
		var bannerURL sql.NullString

		err := rows.Scan(
			&req.RequestID, &req.RequesterID,
			&req.Title, &description,
			&preferredStartTime, &preferredEndTime,
			&expectedCapacity, &req.Status,
			&createdAt, &processedBy,
			&processedAt, &organizerNote, &rejectReason,
			&createdEventID,
			&eventFormat, &customVenueName, &customLocation,
			&orgType, &privacyStatus,
			&onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
			&bannerURL,
		)
		if err != nil {
			log.Printf("Skip corrupted row due to scan error: %v", err)
			continue
		}

		setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
		if processedBy.Valid {
			req.ProcessedBy = pointer(int(processedBy.Int64))
		}
		req.Description = stringPointer(description)
		req.ExpectedCapacity = intPointer(expectedCapacity)
		req.OrganizerNote = stringPointer(organizerNote)
		req.RejectReason = stringPointer(rejectReason)
		req.CreatedEventID = intPointer(createdEventID)
		req.EventFormat = stringPointer(eventFormat)
		req.CustomVenueName = stringPointer(customVenueName)
		req.CustomLocation = stringPointer(customLocation)
		req.OrgType = stringPointer(orgType)
		req.PrivacyStatus = stringPointer(privacyStatus)
		req.OnlineMeetingURL = stringPointer(onlineMeetingURL)
		req.OnlineMeetingID = stringPointer(onlineMeetingID)
		req.OnlineMeetingSecret = stringPointer(onlineMeetingSecret)
		req.BannerURL = stringPointer(bannerURL)

		requests = append(requests, req)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating pending event requests: %w", err)
	}
	rows.Close() // Close rows early to release DB connection back to pool before internal API calls

	// Enrich with API calls
	if err := r.enrichEventRequestsWithAPI(ctx, requests); err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ enrichEventRequestsWithAPI failed: %v", err)
	}

	log.Printf("[API_COMPOSITION] ✅ GetPendingEventRequests: count=%d", len(requests))
	return requests, nil
}

// GetEventRequestByIDComposed - Single request với API enrichment
func (r *EventRepository) GetEventRequestByIDComposed(ctx context.Context, requestID int) (*models.EventRequest, error) {
	log.Printf("[API_COMPOSITION] GetEventRequestByIDComposed: requestID=%d", requestID)

	query := `
		SELECT 
			er.request_id, er.requester_id,
			er.title, er.description,
			er.preferred_start_time, er.preferred_end_time,
			er.expected_capacity, er.status,
			er.created_at, er.processed_by,
			er.processed_at, er.organizer_note, er.reject_reason,
			er.created_event_id,
			er.event_format, er.custom_venue_name, er.custom_location, er.banner_url
		FROM Event_Request er
		WHERE er.request_id = $1
		LIMIT 1
	`

	var req models.EventRequest
	var processedBy sql.NullInt64
	var preferredStartTime, preferredEndTime sql.NullTime
	var processedAt, createdAt sql.NullTime
	var description, organizerNote, rejectReason sql.NullString
	var expectedCapacity, createdEventID sql.NullInt64
	var eventFormat, customVenueName, customLocation, bannerURL sql.NullString

	err := r.db.QueryRowContext(ctx, query, requestID).Scan(
		&req.RequestID, &req.RequesterID,
		&req.Title, &description,
		&preferredStartTime, &preferredEndTime,
		&expectedCapacity, &req.Status,
		&createdAt, &processedBy,
		&processedAt, &organizerNote, &rejectReason,
		&createdEventID,
		&eventFormat, &customVenueName, &customLocation, &bannerURL,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query event request: %w", err)
	}

	setEventRequestTimeFields(&req, preferredStartTime, preferredEndTime, createdAt, processedAt)
	if processedBy.Valid {
		req.ProcessedBy = pointer(int(processedBy.Int64))
	}
	req.Description = stringPointer(description)
	req.ExpectedCapacity = intPointer(expectedCapacity)
	req.OrganizerNote = stringPointer(organizerNote)
	req.RejectReason = stringPointer(rejectReason)
	req.CreatedEventID = intPointer(createdEventID)
	if eventFormat.Valid {
		req.EventFormat = &eventFormat.String
	}
	if customVenueName.Valid {
		req.CustomVenueName = &customVenueName.String
	}
	if customLocation.Valid {
		req.CustomLocation = &customLocation.String
	}
	if bannerURL.Valid {
		req.BannerURL = &bannerURL.String
	}

	// Enrich with API calls (single request)
	requests := []models.EventRequest{req}
	if err := r.enrichEventRequestsWithAPI(ctx, requests); err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ enrichEventRequestsWithAPI failed: %v", err)
	}
	req = requests[0]

	// If there is a created event, fetch event detail (banner, speaker, tickets)
	if req.CreatedEventID != nil {
		detail, err := r.GetEventDetailComposed(ctx, *req.CreatedEventID)
		if err != nil {
			log.Printf("[GetEventRequestByIDComposed] failed to load event detail: %v", err)
			return &req, nil
		}
		if detail != nil {
			if detail.BannerURL != nil {
				req.BannerURL = detail.BannerURL
			}
			sp := models.SpeakerDTO{
				FullName: "",
			}
			if detail.SpeakerName != nil {
				sp.FullName = *detail.SpeakerName
			}
			if detail.SpeakerBio != nil {
				sp.Bio = detail.SpeakerBio
			}
			if detail.SpeakerEmail != nil {
				sp.Email = detail.SpeakerEmail
			}
			if detail.SpeakerPhone != nil {
				sp.Phone = detail.SpeakerPhone
			}
			if detail.SpeakerAvatarURL != nil {
				sp.AvatarURL = detail.SpeakerAvatarURL
			}
			req.Speaker = &sp

			if len(detail.Tickets) > 0 {
				req.Tickets = detail.Tickets
			}
		}
	}

	return &req, nil
}

// ============================================================
// Cross-Domain Transaction Composed Functions
// ============================================================

// ProcessEventRequestComposed - Thay UPDATE Venue_Area trực tiếp bằng API call
func (r *EventRepository) ProcessEventRequestComposed(ctx context.Context, adminID int, req *models.ProcessEventRequestBody) error {
	fmt.Printf("[API_COMPOSITION] ProcessEventRequestComposed: RequestID=%d, Action=%s\n", req.RequestID, req.Action)

	// Start transaction for Event domain operations only
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Lock request row and verify status (check-before-action)
	var currentStatus string
	lockQuery := `
		SELECT status
		FROM Event_Request
		WHERE request_id = $1
		FOR UPDATE
	`
	lockErr := tx.QueryRowContext(ctx, lockQuery, req.RequestID).Scan(&currentStatus)
	if lockErr != nil {
		if errors.Is(lockErr, sql.ErrNoRows) {
			return fmt.Errorf("request not found")
		}
		return fmt.Errorf("failed to lock request: %w", lockErr)
	}

	if currentStatus == "CANCELLED" {
		return ErrRequestCancelled
	}
	if currentStatus != "PENDING" {
		return ErrRequestNotPending
	}

	// REJECTED scenario - same as before (no cross-domain)
	if req.Action == "REJECTED" {
		if req.RejectReason == nil || *req.RejectReason == "" {
			return fmt.Errorf("reject reason is required when rejecting")
		}

		var bannerURL sql.NullString
		tx.QueryRowContext(ctx, `SELECT banner_url FROM Event_Request WHERE request_id = $1`, req.RequestID).Scan(&bannerURL)

		updateQuery := `
			UPDATE Event_Request 
			SET status = 'REJECTED', 
			    processed_by = $1, 
			    processed_at = NOW(),
			    reject_reason = $2
			WHERE request_id = $3
		`

		result, err := tx.ExecContext(ctx, updateQuery, adminID, *req.RejectReason, req.RequestID)
		if err != nil {
			return fmt.Errorf("failed to reject request: %w", err)
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			return fmt.Errorf("request not found or already processed")
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit transaction: %w", err)
		}

		if bannerURL.Valid && bannerURL.String != "" {
			go DeleteImageFromS3IfCustom(context.Background(), bannerURL.String)
		}

		fmt.Printf("[API_COMPOSITION] ✅ REJECTED Request %d\n", req.RequestID)
		return nil
	}

	// APPROVED scenario
	if req.Action == "APPROVED" {
		// B0: Get request details
		var requestTitle string
		var requestDesc sql.NullString
		var requestStartTime, requestEndTime sql.NullTime
		var requestCapacity sql.NullInt64
		var requesterID int
		var eventFormat, customVenueName, customLocation, bannerURL sql.NullString
		var orgType, privacyStatus, onlineMeetingURL, onlineMeetingID, onlineMeetingSecret sql.NullString

		getRequestQuery := `
			SELECT title, description, preferred_start_time, preferred_end_time, 
			       expected_capacity, requester_id, event_format, custom_venue_name, custom_location, banner_url,
			       org_type, privacy_status, online_meeting_url, online_meeting_id, online_meeting_secret
			FROM Event_Request 
			WHERE request_id = $1
		`
		err := tx.QueryRowContext(ctx, getRequestQuery, req.RequestID).Scan(
			&requestTitle, &requestDesc, &requestStartTime, &requestEndTime,
			&requestCapacity, &requesterID, &eventFormat, &customVenueName, &customLocation, &bannerURL,
			&orgType, &privacyStatus, &onlineMeetingURL, &onlineMeetingID, &onlineMeetingSecret,
		)
		if err != nil {
			return fmt.Errorf("failed to get request details: %w", err)
		}

		formatVal := "ONSITE"
		if eventFormat.Valid && eventFormat.String != "" {
			formatVal = normalizeEventFormat(eventFormat.String)
		}
		if !isValidEventFormat(formatVal) {
			return fmt.Errorf("invalid event format: %s", formatVal)
		}
		if err := validateApprovalArea(formatVal, req.AreaID); err != nil {
			return err
		}
		areaIDValue := sqlNullInt64FromID(req.AreaID)

		capacityVal := 0
		if requestCapacity.Valid {
			capacityVal = int(requestCapacity.Int64)
		}

		// ✅ WALL-CLOCK TIME PRESERVATION:
		// Times read from Event_Request are already in wall-clock format (e.g., "09:00:00")
		// due to our storage strategy. The DSN loc=Asia/Ho_Chi_Minh interprets them correctly.
		// We copy them as-is to the Event table WITHOUT any normalization.
		startTimeWallClock := ""
		endTimeWallClock := ""
		if requestStartTime.Valid {
			// Format directly WITHOUT any timezone conversion - preserve the wall-clock time
			startTimeWallClock = requestStartTime.Time.Format("2006-01-02 15:04:05")
			fmt.Printf("[API_COMPOSITION] Wall-clock time copy: startTime=%v -> storage=%s\n",
				requestStartTime.Time, startTimeWallClock)
		}
		if requestEndTime.Valid {
			// Format directly WITHOUT any timezone conversion - preserve the wall-clock time
			endTimeWallClock = requestEndTime.Time.Format("2006-01-02 15:04:05")
			fmt.Printf("[API_COMPOSITION] Wall-clock time copy: endTime=%v -> storage=%s\n",
				requestEndTime.Time, endTimeWallClock)
		}

		// B0.5: Anti Race Condition - Kiểm tra hạn ngạch 2 sự kiện/ngày với FOR UPDATE lock
		// FOR UPDATE khóa các rows phù hợp lại, buộc các transaction đồng thời phải xếp hàng chờ nhau.
		// Nhờ đó, nếu 2 staff duyệt cùng lúc cho cùng ngày, chỉ 1 transaction thành công,
		// transaction còn lại sẽ thấy count = 2 và bị rollback với lỗi vượt giới hạn.
		// We query the matching events with FOR UPDATE to lock the existing rows for that date.
		// Then we count them in Go.
		rows, err := tx.QueryContext(ctx, `
			SELECT event_id 
			FROM Event 
			WHERE start_time::date = $1::date 
			AND status != 'CANCELLED' 
			FOR UPDATE`, startTimeWallClock)
		if err != nil {
			return fmt.Errorf("failed to check daily quota: %w", err)
		}
		defer rows.Close()

		dailyCount := 0
		for rows.Next() {
			var eid int
			if err := rows.Scan(&eid); err != nil {
				return fmt.Errorf("failed to scan daily quota event: %w", err)
			}
			dailyCount++
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("failed to check daily quota rows: %w", err)
		}

		if dailyCount >= 2 {
			fmt.Printf("[QUOTA_LOCK] ❌ Daily limit reached for date %s: currentCount=%d/2. Rolling back.\n", startTimeWallClock[:10], dailyCount)
			return fmt.Errorf("Ngày này đã đạt giới hạn 2 sự kiện. Không thể duyệt thêm")
		}
		fmt.Printf("[QUOTA_LOCK] ✅ Daily quota OK for date %s: currentCount=%d/2. Proceeding.\n", startTimeWallClock[:10], dailyCount)

		// B1: Update Event_Request to APPROVED
		organizerNote := ""
		if req.OrganizerNote != nil {
			organizerNote = *req.OrganizerNote
		}

		updateRequestQuery := `
			UPDATE Event_Request 
			SET status = 'APPROVED', processed_by = $1, processed_at = NOW(), organizer_note = $2
			WHERE request_id = $3
		`
		result, err := tx.ExecContext(ctx, updateRequestQuery, adminID, organizerNote, req.RequestID)
		if err != nil {
			return fmt.Errorf("failed to update request status: %w", err)
		}
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			return fmt.Errorf("request not found or already processed")
		}

		// B2: Create Event
		insertEventQuery := `
			INSERT INTO Event (
				title, description, start_time, end_time, max_seats, 
				banner_url, area_id, speaker_id, status, created_by, created_at,
				event_format, custom_venue_name, custom_location,
				org_type, privacy_status, online_meeting_url, online_meeting_id, online_meeting_secret
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UPDATING', $9, NOW(), $10, $11, $12, $13, $14, $15, $16, $17)
			RETURNING event_id
		`

		speakerIDValue := sql.NullInt64{Valid: false}
		if req.SpeakerID != nil && *req.SpeakerID > 0 {
			speakerIDValue = sql.NullInt64{Int64: int64(*req.SpeakerID), Valid: true}
		}

		bannerURLValue := sql.NullString{Valid: false}
		if req.BannerURL != nil && *req.BannerURL != "" {
			bannerURLValue = sql.NullString{String: *req.BannerURL, Valid: true}
		} else if bannerURL.Valid && bannerURL.String != "" {
			bannerURLValue = bannerURL
		}

		orgTypeValue := "SCHOOL"
		if orgType.Valid && orgType.String != "" {
			orgTypeValue = orgType.String
		}
		privacyStatusValue := "PUBLIC"
		if privacyStatus.Valid && privacyStatus.String != "" {
			privacyStatusValue = privacyStatus.String
		}

		var eventID int64
		err = tx.QueryRowContext(ctx, insertEventQuery,
			requestTitle, requestDesc, startTimeWallClock, endTimeWallClock, capacityVal,
			bannerURLValue, areaIDValue, speakerIDValue, requesterID,
			formatVal, customVenueName, customLocation,
			orgTypeValue, privacyStatusValue, onlineMeetingURL, onlineMeetingID, onlineMeetingSecret,
		).Scan(&eventID)
		if err != nil {
			return fmt.Errorf("failed to create event: %w", err)
		}

		// B3: Link Event_Request to Event
		updateCreatedEventQuery := `
			UPDATE Event_Request SET created_event_id = $1 WHERE request_id = $2
		`
		result, err = tx.ExecContext(ctx, updateCreatedEventQuery, eventID, req.RequestID)
		if err != nil {
			return fmt.Errorf("failed to update created_event_id: %w", err)
		}
		rowsAffected, _ = result.RowsAffected()
		if rowsAffected == 0 {
			return fmt.Errorf("failed to link event to request")
		}

		// Commit Event domain transaction first
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit transaction: %w", err)
		}

		fmt.Printf("[API_COMPOSITION] Step B1-B3 committed: Event %d created\n", eventID)

		if !eventFormatRequiresArea(formatVal) {
			fmt.Printf("[API_COMPOSITION] Step B4 skipped: ONLINE event does not require a venue area\n")
			return nil
		}

		// B4: Mark Venue_Area as UNAVAILABLE via API call (cross-domain)
		fmt.Printf("[API_COMPOSITION] Step B4: Calling area-status API for AreaID=%d\n", *req.AreaID)

		err = updateAreaStatusViaAPI(ctx, *req.AreaID, "UNAVAILABLE")
		if err != nil {
			// ⚠️ Compensating action: If area status update fails, we should ideally rollback
			// But Event transaction is already committed. Log error for manual recovery.
			log.Printf("[API_COMPOSITION] ❌ CRITICAL: Failed to mark area %d as UNAVAILABLE: %v", *req.AreaID, err)
			log.Printf("[API_COMPOSITION] ⚠️ MANUAL RECOVERY NEEDED: Event %d created but area %d not locked", eventID, *req.AreaID)
			// Don't return error - Event was created successfully
			// In a full Saga pattern, we would compensate by cancelling the event
		}

		fmt.Printf("[API_COMPOSITION] ✅ APPROVED Request %d, created Event %d\n", req.RequestID, eventID)
		return nil
	}

	return fmt.Errorf("invalid action: %s", req.Action)
}

// CancelEventComposed - Thay UPDATE Venue_Area trực tiếp bằng API call
func (r *EventRepository) CancelEventComposed(ctx context.Context, userID, eventID int) error {
	log.Printf("[API_COMPOSITION] CancelEventComposed: EventID=%d, UserID=%d", eventID, userID)

	// Step 1-5: Same as monolith (single-table queries)
	var status string
	var createdBy int
	var requestID sql.NullInt64
	var startTime time.Time
	var eventTitle string
	var bannerURL sql.NullString

	checkQuery := `
		SELECT e.status, e.created_by, e.start_time, e.title, e.banner_url,
		       (SELECT request_id FROM Event_Request WHERE created_event_id = e.event_id LIMIT 1) as request_id
		FROM Event e
		WHERE e.event_id = $1
	`
	err := r.db.QueryRowContext(ctx, checkQuery, eventID).Scan(&status, &createdBy, &startTime, &eventTitle, &bannerURL, &requestID)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("sự kiện không tồn tại")
		}
		return fmt.Errorf("lỗi kiểm tra sự kiện: %w", err)
	}

	if createdBy != userID {
		return fmt.Errorf("bạn không có quyền hủy sự kiện này")
	}
	if status == "CANCELLED" {
		return fmt.Errorf("sự kiện đã được hủy trước đó")
	}

	// 24-hour rule
	now := utils.NowInVietnam()
	hoursUntilStart := startTime.Sub(now).Hours()
	if hoursUntilStart < 24 {
		return fmt.Errorf("không thể hủy sự kiện trong vòng 24 giờ trước khi bắt đầu (còn %.1f giờ)", hoursUntilStart)
	}

	// Check ticket sales
	var ticketsSoldCount int
	ticketCheckQuery := `
		SELECT COUNT(*) 
		FROM Ticket 
		WHERE event_id = $1 AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')
	`
	err = r.db.QueryRowContext(ctx, ticketCheckQuery, eventID).Scan(&ticketsSoldCount)
	if err != nil {
		return fmt.Errorf("lỗi kiểm tra vé đã bán: %w", err)
	}

	if ticketsSoldCount > 0 {
		return fmt.Errorf("REFUND_WARNING:Sự kiện đã có %d người đăng ký. Bạn có chắc chắn muốn hủy và thực hiện hoàn tiền không?", ticketsSoldCount)
	}

	// Step 6: Start transaction (Event domain only)
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	// Step 7: Update Event status
	updateEventQuery := `UPDATE Event SET status = 'CANCELLED' WHERE event_id = $1 AND created_by = $2`
	result1, err := tx.ExecContext(ctx, updateEventQuery, eventID, userID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật sự kiện: %w", err)
	}
	rowsAffected1, _ := result1.RowsAffected()
	if rowsAffected1 == 0 {
		return fmt.Errorf("không thể cập nhật sự kiện")
	}

	// Step 8: Update Event_Request status
	if requestID.Valid {
		reqID := int(requestID.Int64)
		updateRequestQuery := `UPDATE Event_Request SET status = 'CANCELLED' WHERE request_id = $1`
		tx.ExecContext(ctx, updateRequestQuery, reqID)
	}

	// Get area_id before committing
	var areaID sql.NullInt64
	areaQuery := `SELECT area_id FROM Event WHERE event_id = $1`
	tx.QueryRowContext(ctx, areaQuery, eventID).Scan(&areaID)

	// Commit Event domain transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	if bannerURL.Valid && bannerURL.String != "" {
		go DeleteImageFromS3IfCustom(context.Background(), bannerURL.String)
	}

	// Step 9: Release Venue Area via API (cross-domain)
	if areaID.Valid {
		err = updateAreaStatusViaAPI(ctx, int(areaID.Int64), "AVAILABLE")
		if err != nil {
			log.Printf("[API_COMPOSITION] ⚠️ Failed to release area %d via API: %v", areaID.Int64, err)
			log.Printf("[API_COMPOSITION] ⚠️ MANUAL RECOVERY: Area %d should be set to AVAILABLE", areaID.Int64)
		} else {
			log.Printf("[API_COMPOSITION] ✅ Released Area [%d] to AVAILABLE after Cancellation of Event [%d]", areaID.Int64, eventID)
		}
	}

	log.Printf("[API_COMPOSITION] ✅ Cancelled Event %d (Title: %s)", eventID, eventTitle)
	return nil
}

// ============================================================
// GetEventStats Composed - Thay JOIN Ticket bằng API call
// ============================================================

// GetEventStatsComposed - Single event stats via Ticket API
func (r *EventRepository) GetEventStatsComposed(ctx context.Context, eventID int) (*models.EventStatsResponse, error) {
	log.Printf("[API_COMPOSITION] GetEventStatsComposed: eventID=%d", eventID)

	// Get event title from Event table (Event domain only)
	var eventTitle string
	err := r.db.QueryRowContext(ctx, "SELECT title FROM Event WHERE event_id = $1", eventID).Scan(&eventTitle)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get event title: %w", err)
	}

	// Fetch ticket stats via API
	ticketStats, err := fetchTicketStats(ctx, eventID)
	if err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch ticket stats: %v", err)
		// Return empty stats instead of error
		return &models.EventStatsResponse{
			EventID:    eventID,
			EventTitle: &eventTitle,
		}, nil
	}

	stats := &models.EventStatsResponse{
		EventID:         eventID,
		EventTitle:      &eventTitle,
		TotalTickets:    ticketStats.TotalTickets,
		CheckedInCount:  ticketStats.CheckedInCount,
		CheckedOutCount: ticketStats.CheckedOutCount,
		BookedCount:     ticketStats.BookedCount,
		CancelledCount:  ticketStats.CancelledCount,
		RefundedCount:   ticketStats.RefundedCount,
		TotalRevenue:    ticketStats.TotalRevenue,
	}

	log.Printf("[API_COMPOSITION] ✅ GetEventStats: eventID=%d, total=%d, revenue=%.2f",
		eventID, stats.TotalTickets, stats.TotalRevenue)
	return stats, nil
}

// GetAggregateEventStatsComposed - Aggregate stats via Ticket API
func (r *EventRepository) GetAggregateEventStatsComposed(ctx context.Context, role string, userID int) (*models.EventStatsResponse, error) {
	log.Printf("[API_COMPOSITION] GetAggregateEventStatsComposed: role=%s, userID=%d", role, userID)

	var ticketStats *TicketStatsDTO
	var err error

	if role == "ADMIN" || role == "STAFF" {
		ticketStats, err = fetchAggregateTicketStats(ctx, nil)
	} else if role == "ORGANIZER" {
		ticketStats, err = fetchAggregateTicketStats(ctx, &userID)
	} else {
		return nil, fmt.Errorf("unauthorized role: %s", role)
	}

	if err != nil {
		log.Printf("[API_COMPOSITION] ⚠️ Failed to fetch aggregate ticket stats: %v", err)
		title := "Tất cả sự kiện"
		return &models.EventStatsResponse{
			EventTitle: &title,
		}, nil
	}

	title := "Tất cả sự kiện"
	stats := &models.EventStatsResponse{
		EventID:         0,
		EventTitle:      &title,
		TotalTickets:    ticketStats.TotalTickets,
		CheckedInCount:  ticketStats.CheckedInCount,
		CheckedOutCount: ticketStats.CheckedOutCount,
		BookedCount:     ticketStats.BookedCount,
		CancelledCount:  ticketStats.CancelledCount,
		RefundedCount:   ticketStats.RefundedCount,
		TotalRevenue:    ticketStats.TotalRevenue,
	}

	log.Printf("[API_COMPOSITION] ✅ GetAggregateEventStats: total=%d, revenue=%.2f",
		stats.TotalTickets, stats.TotalRevenue)
	return stats, nil
}
