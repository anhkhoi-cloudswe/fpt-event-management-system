package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/ticket-lambda/models"
)

// ============================================================
// API Composition: GetTicketsByUserID (Microservices Pattern)
//
// Thay thế SQL JOIN 7 bảng chéo domain bằng:
//   Bước 1: Query Ticket + Bill (ticket domain only)
//   Bước 2: Gọi API nội bộ song song (event, venue, auth)
//   Bước 3: Map dữ liệu thành MyTicketResponse (giữ nguyên JSON)
// ============================================================

// internalTicketRow chứa dữ liệu thô từ bảng Ticket (domain thuần)
type internalTicketRow struct {
	TicketID         int
	EventID          int
	UserID           int
	CategoryTicketID int
	SeatID           *int
	Status           string
	QRCodeValue      *string
	CheckinTime      *sql.NullTime
	CheckOutTime     *sql.NullTime
	CreatedAt        sql.NullTime
}

// eventInfo dữ liệu nhận từ event-lambda
type eventInfo struct {
	EventID   int    `json:"eventId"`
	Title     string `json:"title"`
	StartTime string `json:"startTime"`
	AreaID    *int   `json:"areaId"`
}

// categoryTicketInfo dữ liệu nhận từ event-lambda
type categoryTicketInfo struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	Name             string  `json:"name"`
	Price            float64 `json:"price"`
}

// venueAreaInfo dữ liệu nhận từ venue-lambda
type venueAreaInfo struct {
	AreaID  int    `json:"areaId"`
	VenueID int    `json:"venueId"`
	Name    string `json:"areaName"`
}

// venueInfo dữ liệu nhận từ venue-lambda
type venueInfo struct {
	VenueID   int    `json:"venueId"`
	VenueName string `json:"venueName"`
}

// seatInfo dữ liệu nhận từ venue-lambda
type seatInfo struct {
	SeatID   int    `json:"seatId"`
	SeatCode string `json:"seatCode"`
}

// userInfo dữ liệu nhận từ auth-lambda
type userInfo struct {
	UserID   int    `json:"userId"`
	FullName string `json:"fullName"`
}

// eventDetailResponse response từ GET /api/events/detail
type eventDetailResponse struct {
	EventID   int     `json:"eventId"`
	Title     string  `json:"title"`
	StartTime string  `json:"startTime"`
	AreaID    *int    `json:"areaId"`
	Venue     *string `json:"venueName"`
	AreaName  *string `json:"areaName"`
}

// ============================================================
// GetTicketsByUserIDComposed - API Composition Pattern
// ============================================================

func (r *TicketRepository) GetTicketsByUserIDComposed(ctx context.Context, userID int) ([]models.MyTicketResponse, error) {
	log := logger.Default()
	client := utils.NewInternalClient()

	// ─── BƯỚC 1: Query Ticket domain only ───
	ticketRows, err := r.queryTicketRowsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query ticket rows: %w", err)
	}

	if len(ticketRows) == 0 {
		return []models.MyTicketResponse{}, nil
	}

	// Thu thập tất cả ID cần look up
	eventIDs := map[int]bool{}
	categoryIDs := map[int]bool{}
	seatIDs := map[int]bool{}
	userIDs := map[int]bool{}

	for _, t := range ticketRows {
		eventIDs[t.EventID] = true
		categoryIDs[t.CategoryTicketID] = true
		if t.SeatID != nil {
			seatIDs[*t.SeatID] = true
		}
		userIDs[t.UserID] = true
	}

	// ─── BƯỚC 2: Gọi API song song ───
	var (
		eventMap    = map[int]*eventDetailResponse{}
		categoryMap = map[int]*categoryTicketInfo{}
		seatMap     = map[int]*seatInfo{}
		userMap     = map[int]*userInfo{}

		wg      sync.WaitGroup
		mu      sync.Mutex
		errChan = make(chan error, 4)
	)

	// 2a. Gọi event-lambda: lấy thông tin sự kiện + venue (đã có sẵn trong event detail)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for eventID := range eventIDs {
			var detail eventDetailResponse
			baseURL := utils.GetEventServiceURL() + "/api/events/detail"
			params := map[string]string{"id": strconv.Itoa(eventID)}

			statusCode, err := client.GetJSON(ctx, baseURL, params, &detail)
			if err != nil {
				log.Warn("Failed to fetch event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				detail.EventID = eventID
				eventMap[eventID] = &detail
				mu.Unlock()
			}
		}
	}()

	// 2b. Gọi event-lambda: lấy thông tin category tickets (theo từng event)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Lấy category tickets theo event
		for eventID := range eventIDs {
			var categories []categoryTicketInfo
			baseURL := utils.GetTicketServiceURL() + "/api/category-tickets"
			params := map[string]string{"eventId": strconv.Itoa(eventID)}

			statusCode, err := client.GetJSON(ctx, baseURL, params, &categories)
			if err != nil {
				log.Warn("Failed to fetch categories for event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				for i := range categories {
					cat := categories[i]
					categoryMap[cat.CategoryTicketID] = &cat
				}
				mu.Unlock()
			}
		}
	}()

	// 2c. Gọi venue-lambda: lấy thông tin seats
	wg.Add(1)
	go func() {
		defer wg.Done()
		if len(seatIDs) == 0 {
			return
		}
		// Lấy seats theo event
		for eventID := range eventIDs {
			var response struct {
				Seats []seatInfo `json:"seats"`
			}
			baseURL := utils.GetVenueServiceURL() + "/api/seats"
			params := map[string]string{"eventId": strconv.Itoa(eventID)}

			statusCode, err := client.GetJSON(ctx, baseURL, params, &response)
			if err != nil {
				log.Warn("Failed to fetch seats for event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				for i := range response.Seats {
					s := response.Seats[i]
					seatMap[s.SeatID] = &s
				}
				mu.Unlock()
			}
		}
	}()

	// 2d. Lấy thông tin user (buyer name)
	// API /api/users/staff-organizer trả về object {staffList:[{id,fullName}...], organizerList:[...]}
	// KHÔNG phải flat array — phải unmarshal đúng kiểu.
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Gọi API 1 lần cho tất cả uid (API trả toàn bộ danh sách)
		var staffOrgResp struct {
			StaffList []struct {
				ID       int    `json:"id"`
				FullName string `json:"fullName"`
			} `json:"staffList"`
			OrganizerList []struct {
				ID       int    `json:"id"`
				FullName string `json:"fullName"`
			} `json:"organizerList"`
		}
		baseURL := utils.GetAuthServiceURL() + "/api/users/staff-organizer"
		statusCode, err := client.GetJSON(ctx, baseURL, nil, &staffOrgResp)
		if err != nil || statusCode != 200 {
			log.Warn("Failed to fetch staff-organizer list (status=%d): %v — falling back to DB", statusCode, err)
			// Fallback per-uid: query DB trực tiếp
			for uid := range userIDs {
				name, dbErr := r.getUserNameByID(ctx, uid)
				if dbErr == nil && name != "" {
					mu.Lock()
					userMap[uid] = &userInfo{UserID: uid, FullName: name}
					mu.Unlock()
				}
			}
		} else {
			mu.Lock()
			for _, u := range staffOrgResp.StaffList {
				userMap[u.ID] = &userInfo{UserID: u.ID, FullName: u.FullName}
			}
			for _, u := range staffOrgResp.OrganizerList {
				userMap[u.ID] = &userInfo{UserID: u.ID, FullName: u.FullName}
			}
			mu.Unlock()
		}
	}()

	wg.Wait()
	close(errChan)

	// ─── BƯỚC 3: Data Mapping → MyTicketResponse ───
	tickets := make([]models.MyTicketResponse, 0, len(ticketRows))

	for _, row := range ticketRows {
		ticket := models.MyTicketResponse{
			TicketID: row.TicketID,
			Status:   row.Status,
		}

		// QR Code
		if row.QRCodeValue != nil {
			ticket.TicketCode = row.QRCodeValue
		}

		// Check-in/out times
		if row.CheckinTime != nil && row.CheckinTime.Valid {
			ticket.CheckInTime = &row.CheckinTime.Time
		}
		if row.CheckOutTime != nil && row.CheckOutTime.Valid {
			ticket.CheckOutTime = &row.CheckOutTime.Time
		}

		// Event info (từ event-lambda)
		if evt, ok := eventMap[row.EventID]; ok {
			ticket.EventName = &evt.Title
			if evt.StartTime != "" {
				if parsed, err := parseTime(evt.StartTime); err == nil {
					ticket.StartTime = &parsed
					ticket.PurchaseDate = &parsed // giữ nguyên behavior cũ: purchase_date = start_time
				}
			}
			// Venue name đã có sẵn trong event detail response
			if evt.Venue != nil {
				ticket.VenueName = evt.Venue
			}
		}

		// Category ticket info (tên hạng vé + giá)
		if cat, ok := categoryMap[row.CategoryTicketID]; ok {
			ticket.Category = &cat.Name
			ticket.CategoryPrice = &cat.Price
		}

		// Seat info
		if row.SeatID != nil {
			if seat, ok := seatMap[*row.SeatID]; ok {
				ticket.SeatCode = &seat.SeatCode
			}
		}

		// Buyer name
		if user, ok := userMap[row.UserID]; ok {
			ticket.BuyerName = &user.FullName
		}

		tickets = append(tickets, ticket)
	}

	return tickets, nil
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

// queryTicketRowsByUserID - Query DUY NHẤT bảng Ticket (domain thuần)
func (r *TicketRepository) queryTicketRowsByUserID(ctx context.Context, userID int) ([]internalTicketRow, error) {
	query := `
		SELECT 
			t.ticket_id,
			t.event_id,
			t.user_id,
			t.category_ticket_id,
			t.seat_id,
			t.status,
			t.qr_code_value,
			t.checkin_time,
			t.check_out_time,
			t.created_at
		FROM Ticket t
		WHERE t.user_id = ?
		ORDER BY t.ticket_id DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets: %w", err)
	}
	defer rows.Close()

	var tickets []internalTicketRow
	for rows.Next() {
		var t internalTicketRow
		var (
			seatID      sql.NullInt64
			qrCode      sql.NullString
			checkinTime sql.NullTime
			checkOut    sql.NullTime
			createdAt   sql.NullTime
		)

		err := rows.Scan(
			&t.TicketID,
			&t.EventID,
			&t.UserID,
			&t.CategoryTicketID,
			&seatID,
			&t.Status,
			&qrCode,
			&checkinTime,
			&checkOut,
			&createdAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ticket row: %w", err)
		}

		if seatID.Valid {
			id := int(seatID.Int64)
			t.SeatID = &id
		}
		if qrCode.Valid {
			t.QRCodeValue = &qrCode.String
		}
		t.CheckinTime = &checkinTime
		t.CheckOutTime = &checkOut
		t.CreatedAt = createdAt

		tickets = append(tickets, t)
	}

	return tickets, nil
}

// getUserNameByID - Fallback: lấy tên user trực tiếp từ DB
// Chỉ dùng khi API auth-lambda không phản hồi
func (r *TicketRepository) getUserNameByID(ctx context.Context, userID int) (string, error) {
	var name sql.NullString
	err := r.db.QueryRowContext(ctx,
		"SELECT full_name FROM Users WHERE user_id = ?", userID,
	).Scan(&name)
	if err != nil {
		return "", err
	}
	if name.Valid {
		return name.String, nil
	}
	return "", nil
}

// parseTime parse chuỗi thời gian từ API response, hỗ trợ nhiều format
func parseTime(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range formats {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse time: %s", s)
}

// ============================================================
// GetTicketsByUserIDPaginatedComposed - API Composition Pattern
//
// Thay thế SQL JOIN 7 bảng bằng:
//   Bước 1: Query Ticket domain only (với pagination + search/filter)
//   Bước 2: Gọi API nội bộ song song (event, venue, auth)
//   Bước 3: Map dữ liệu thành PaginatedTicketsResponse (giữ nguyên JSON)
//
// Search: tìm theo event title → cần query event IDs trước hoặc search local
// Filter: status filter → áp dụng trên Ticket table (local)
// ============================================================

func (r *TicketRepository) GetTicketsByUserIDPaginatedComposed(ctx context.Context, userID, page, limit int, search, status string) (*models.PaginatedTicketsResponse, error) {
	log := logger.Default()
	client := utils.NewInternalClient()
	offset := (page - 1) * limit

	// ─── BƯỚC 1: Query Ticket domain only (pagination) ───
	// Search theo event title: cần JOIN Event chỉ để WHERE e.title LIKE ?
	// Thay vì JOIN đầy đủ, ta giữ 1 JOIN với Event chỉ cho search
	whereConditions := []string{"t.user_id = ?"}
	args := []interface{}{userID}

	if search != "" {
		whereConditions = append(whereConditions, "e.title LIKE ?")
		args = append(args, "%"+search+"%")
	}
	if status != "" {
		whereConditions = append(whereConditions, "t.status = ?")
		args = append(args, status)
	}

	whereClause := strings.Join(whereConditions, " AND ")

	// Count total records (chỉ JOIN Event cho search)
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		WHERE %s
	`, whereClause)

	var totalRecords int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords)
	if err != nil {
		return nil, fmt.Errorf("failed to count tickets: %w", err)
	}

	totalPages := (totalRecords + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	// Query ticket IDs + basic fields (chỉ JOIN Event cho search)
	dataQuery := fmt.Sprintf(`
		SELECT 
			t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
			t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		WHERE %s
		ORDER BY t.ticket_id DESC
		LIMIT ? OFFSET ?
	`, whereClause)

	dataArgs := append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets: %w", err)
	}
	defer rows.Close()

	var ticketRows []internalTicketRow
	for rows.Next() {
		var t internalTicketRow
		var (
			seatID      sql.NullInt64
			qrCode      sql.NullString
			checkinTime sql.NullTime
			checkOut    sql.NullTime
			createdAt   sql.NullTime
		)

		err := rows.Scan(
			&t.TicketID, &t.EventID, &t.UserID, &t.CategoryTicketID, &seatID,
			&t.Status, &qrCode, &checkinTime, &checkOut, &createdAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ticket row: %w", err)
		}

		if seatID.Valid {
			id := int(seatID.Int64)
			t.SeatID = &id
		}
		if qrCode.Valid {
			t.QRCodeValue = &qrCode.String
		}
		t.CheckinTime = &checkinTime
		t.CheckOutTime = &checkOut
		t.CreatedAt = createdAt

		ticketRows = append(ticketRows, t)
	}

	if len(ticketRows) == 0 {
		return &models.PaginatedTicketsResponse{
			Tickets:      []models.MyTicketResponse{},
			TotalPages:   totalPages,
			CurrentPage:  page,
			TotalRecords: totalRecords,
		}, nil
	}

	// ─── BƯỚC 2: Gọi API song song (reuse enrichTicketRows) ───
	tickets, err := r.enrichTicketRows(ctx, client, log, ticketRows)
	if err != nil {
		return nil, fmt.Errorf("failed to enrich ticket data: %w", err)
	}

	return &models.PaginatedTicketsResponse{
		Tickets:      tickets,
		TotalPages:   totalPages,
		CurrentPage:  page,
		TotalRecords: totalRecords,
	}, nil
}

// ============================================================
// GetTicketsByRoleComposed - API Composition Pattern
//
// Thay thế SQL JOIN 7 bảng bằng:
//   Bước 1: Query Ticket domain only (role-based WHERE)
//   Bước 2: Gọi API nội bộ song song (event, venue, auth)
//   Bước 3: Map dữ liệu thành []MyTicketResponse (giữ nguyên JSON)
//
// Role logic:
//   ADMIN/STAFF: xem tất cả (optional filter by eventId)
//   ORGANIZER: xem vé của event mình tạo (cần JOIN Event.created_by)
//   Default: xem vé của chính mình
// ============================================================

func (r *TicketRepository) GetTicketsByRoleComposed(ctx context.Context, role string, userID int, eventID *int) ([]models.MyTicketResponse, error) {
	log := logger.Default()
	client := utils.NewInternalClient()

	// ─── BƯỚC 1: Query Ticket domain only (role-based) ───
	var query string
	var queryArgs []interface{}

	// ORGANIZER cần JOIN Event để check created_by
	// Các role khác query thuần Ticket table
	switch role {
	case "ADMIN", "STAFF":
		if eventID != nil {
			query = `SELECT t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
				t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
				FROM Ticket t WHERE t.event_id = ? ORDER BY t.ticket_id DESC`
			queryArgs = append(queryArgs, *eventID)
		} else {
			query = `SELECT t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
				t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
				FROM Ticket t ORDER BY t.ticket_id DESC`
		}
	case "ORGANIZER":
		// Cần JOIN Event để filter theo created_by
		if eventID != nil {
			query = `SELECT t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
				t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
				FROM Ticket t JOIN Event e ON t.event_id = e.event_id
				WHERE e.created_by = ? AND t.event_id = ? ORDER BY t.ticket_id DESC`
			queryArgs = append(queryArgs, userID, *eventID)
		} else {
			query = `SELECT t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
				t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
				FROM Ticket t JOIN Event e ON t.event_id = e.event_id
				WHERE e.created_by = ? ORDER BY t.ticket_id DESC`
			queryArgs = append(queryArgs, userID)
		}
	default:
		// Regular user → same as GetTicketsByUserIDComposed
		query = `SELECT t.ticket_id, t.event_id, t.user_id, t.category_ticket_id, t.seat_id,
			t.status, t.qr_code_value, t.checkin_time, t.check_out_time, t.created_at
			FROM Ticket t WHERE t.user_id = ? ORDER BY t.ticket_id DESC`
		queryArgs = append(queryArgs, userID)
	}

	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets by role: %w", err)
	}
	defer rows.Close()

	var ticketRows []internalTicketRow
	for rows.Next() {
		var t internalTicketRow
		var (
			seatID      sql.NullInt64
			qrCode      sql.NullString
			checkinTime sql.NullTime
			checkOut    sql.NullTime
			createdAt   sql.NullTime
		)

		err := rows.Scan(
			&t.TicketID, &t.EventID, &t.UserID, &t.CategoryTicketID, &seatID,
			&t.Status, &qrCode, &checkinTime, &checkOut, &createdAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ticket row: %w", err)
		}

		if seatID.Valid {
			id := int(seatID.Int64)
			t.SeatID = &id
		}
		if qrCode.Valid {
			t.QRCodeValue = &qrCode.String
		}
		t.CheckinTime = &checkinTime
		t.CheckOutTime = &checkOut
		t.CreatedAt = createdAt

		ticketRows = append(ticketRows, t)
	}

	if len(ticketRows) == 0 {
		return []models.MyTicketResponse{}, nil
	}

	// ─── BƯỚC 2: Gọi API song song (reuse enrichTicketRows) ───
	return r.enrichTicketRows(ctx, client, log, ticketRows)
}

// ============================================================
// enrichTicketRows - Shared helper for API Composition
//
// Nhận danh sách ticket rows (domain thuần)
// Gọi API nội bộ song song để lấy event, category, seat, user info
// Trả về []MyTicketResponse đầy đủ
// ============================================================

func (r *TicketRepository) enrichTicketRows(ctx context.Context, client *utils.InternalClient, log *logger.Logger, ticketRows []internalTicketRow) ([]models.MyTicketResponse, error) {
	// Thu thập tất cả ID cần look up
	eventIDs := map[int]bool{}
	categoryIDs := map[int]bool{}
	seatIDs := map[int]bool{}
	userIDs := map[int]bool{}

	for _, t := range ticketRows {
		eventIDs[t.EventID] = true
		categoryIDs[t.CategoryTicketID] = true
		if t.SeatID != nil {
			seatIDs[*t.SeatID] = true
		}
		userIDs[t.UserID] = true
	}

	// Gọi API song song
	var (
		eventMap    = map[int]*eventDetailResponse{}
		categoryMap = map[int]*categoryTicketInfo{}
		seatMap     = map[int]*seatInfo{}
		userMap     = map[int]*userInfo{}

		wg      sync.WaitGroup
		mu      sync.Mutex
		errChan = make(chan error, 4)
	)

	// Event info
	wg.Add(1)
	go func() {
		defer wg.Done()
		for eventID := range eventIDs {
			var detail eventDetailResponse
			baseURL := utils.GetEventServiceURL() + "/api/events/detail"
			params := map[string]string{"id": strconv.Itoa(eventID)}
			statusCode, err := client.GetJSON(ctx, baseURL, params, &detail)
			if err != nil {
				log.Warn("Failed to fetch event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				detail.EventID = eventID
				eventMap[eventID] = &detail
				mu.Unlock()
			}
		}
	}()

	// Category tickets
	wg.Add(1)
	go func() {
		defer wg.Done()
		for eventID := range eventIDs {
			var categories []categoryTicketInfo
			baseURL := utils.GetTicketServiceURL() + "/api/category-tickets"
			params := map[string]string{"eventId": strconv.Itoa(eventID)}
			statusCode, err := client.GetJSON(ctx, baseURL, params, &categories)
			if err != nil {
				log.Warn("Failed to fetch categories for event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				for i := range categories {
					cat := categories[i]
					categoryMap[cat.CategoryTicketID] = &cat
				}
				mu.Unlock()
			}
		}
	}()

	// Seats
	wg.Add(1)
	go func() {
		defer wg.Done()
		if len(seatIDs) == 0 {
			return
		}
		for eventID := range eventIDs {
			var response struct {
				Seats []seatInfo `json:"seats"`
			}
			baseURL := utils.GetVenueServiceURL() + "/api/seats"
			params := map[string]string{"eventId": strconv.Itoa(eventID)}
			statusCode, err := client.GetJSON(ctx, baseURL, params, &response)
			if err != nil {
				log.Warn("Failed to fetch seats for event %d: %v", eventID, err)
				continue
			}
			if statusCode == 200 {
				mu.Lock()
				for i := range response.Seats {
					s := response.Seats[i]
					seatMap[s.SeatID] = &s
				}
				mu.Unlock()
			}
		}
	}()

	// Users — API trả về object {staffList:[{id,...}], organizerList:[...]} không phải flat array
	wg.Add(1)
	go func() {
		defer wg.Done()
		var staffOrgResp struct {
			StaffList []struct {
				ID       int    `json:"id"`
				FullName string `json:"fullName"`
			} `json:"staffList"`
			OrganizerList []struct {
				ID       int    `json:"id"`
				FullName string `json:"fullName"`
			} `json:"organizerList"`
		}
		baseURL := utils.GetAuthServiceURL() + "/api/users/staff-organizer"
		statusCode, err := client.GetJSON(ctx, baseURL, nil, &staffOrgResp)
		if err != nil || statusCode != 200 {
			log.Warn("Failed to fetch staff-organizer list (status=%d): %v — falling back to DB", statusCode, err)
			for uid := range userIDs {
				name, dbErr := r.getUserNameByID(ctx, uid)
				if dbErr == nil && name != "" {
					mu.Lock()
					userMap[uid] = &userInfo{UserID: uid, FullName: name}
					mu.Unlock()
				}
			}
		} else {
			mu.Lock()
			for _, u := range staffOrgResp.StaffList {
				userMap[u.ID] = &userInfo{UserID: u.ID, FullName: u.FullName}
			}
			for _, u := range staffOrgResp.OrganizerList {
				userMap[u.ID] = &userInfo{UserID: u.ID, FullName: u.FullName}
			}
			mu.Unlock()
		}
	}()

	wg.Wait()
	close(errChan)

	// ─── BƯỚC 3: Data Mapping → MyTicketResponse ───
	tickets := make([]models.MyTicketResponse, 0, len(ticketRows))

	for _, row := range ticketRows {
		ticket := models.MyTicketResponse{
			TicketID: row.TicketID,
			Status:   row.Status,
		}

		if row.QRCodeValue != nil {
			ticket.TicketCode = row.QRCodeValue
		}
		if row.CheckinTime != nil && row.CheckinTime.Valid {
			ticket.CheckInTime = &row.CheckinTime.Time
		}
		if row.CheckOutTime != nil && row.CheckOutTime.Valid {
			ticket.CheckOutTime = &row.CheckOutTime.Time
		}

		// Event info
		if evt, ok := eventMap[row.EventID]; ok {
			ticket.EventName = &evt.Title
			if evt.StartTime != "" {
				if parsed, err := parseTime(evt.StartTime); err == nil {
					ticket.StartTime = &parsed
					ticket.PurchaseDate = &parsed
				}
			}
			if evt.Venue != nil {
				ticket.VenueName = evt.Venue
			}
		}

		// Category ticket
		if cat, ok := categoryMap[row.CategoryTicketID]; ok {
			ticket.Category = &cat.Name
			ticket.CategoryPrice = &cat.Price
		}

		// Seat
		if row.SeatID != nil {
			if seat, ok := seatMap[*row.SeatID]; ok {
				ticket.SeatCode = &seat.SeatCode
			}
		}

		// Buyer name
		if user, ok := userMap[row.UserID]; ok {
			ticket.BuyerName = &user.FullName
		}

		tickets = append(tickets, ticket)
	}

	return tickets, nil
}
