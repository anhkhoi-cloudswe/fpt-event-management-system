package repository

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"sync"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/venue-lambda/models"
)

// ============================================================
// API Composition: Venue Service (Microservices Pattern)
//
// Refactor các câu JOIN chéo domain trong venue_repository.go:
//   1. HasActiveEvents       → Gọi event-lambda internal API
//   2. GetFreeAreas          → Tách query Venue + gọi event-lambda
//   3. GetAllSeats           → Tách query Seat + gọi ticket-lambda (category)
//   4. GetSeatsForEvent      → Gọi event-lambda (area_id) + ticket-lambda (status)
//
// Nguyên tắc:
//   - KHÔNG xóa code cũ (giữ nguyên hàm gốc)
//   - Logic mới nằm trong hàm *Composed()
//   - Feature Flag: VENUE_API_ENABLED = true → dùng composed
// ============================================================

// ============================================================
// 1. HasActiveEventsComposed - Kiểm tra venue có event OPEN/DRAFT
//    Thay thế: JOIN Event e ON Venue_Area.area_id = e.area_id
//    Gọi: event-lambda → GET /internal/events/active-by-venue?venueId=
// ============================================================

// activeEventsResponse response từ event-lambda internal API
type activeEventsResponse struct {
	Count int `json:"count"`
}

func (r *VenueRepository) HasActiveEventsComposed(ctx context.Context, venueID int) (bool, error) {
	log := logger.Default()
	client := utils.NewInternalClient()

	baseURL := utils.GetEventServiceURL() + "/internal/events/active-by-venue"
	params := map[string]string{"venueId": strconv.Itoa(venueID)}

	var result activeEventsResponse
	statusCode, err := client.GetJSON(ctx, baseURL, params, &result)
	if err != nil {
		log.Warn("[VENUE_COMPOSED] Failed to check active events via API for venueId=%d: %v, falling back to DB", venueID, err)
		// Fallback: query trực tiếp nếu event-lambda không phản hồi
		return r.HasActiveEvents(ctx, venueID)
	}

	if statusCode != 200 {
		log.Warn("[VENUE_COMPOSED] Event service returned status %d for venueId=%d, falling back to DB", statusCode, venueID)
		return r.HasActiveEvents(ctx, venueID)
	}

	log.Info("[VENUE_COMPOSED] ✅ HasActiveEventsComposed: venueId=%d, activeCount=%d", venueID, result.Count)
	return result.Count > 0, nil
}

// ============================================================
// 2. GetFreeAreasComposed - Lấy area trống trong khoảng thời gian
//    Thay thế: JOIN Venue + subquery Event
//    Bước 1: Query Venue_Area + Venue (cùng domain)
//    Bước 2: Gọi event-lambda → lấy danh sách area_id đã bận
//    Bước 3: Filter local → chỉ giữ area chưa bận
// ============================================================

// busyAreasResponse response từ event-lambda internal API
type busyAreasResponse struct {
	AreaIDs []int `json:"areaIds"`
}

func (r *VenueRepository) GetFreeAreasComposed(ctx context.Context, startTime, endTime string) ([]models.FreeAreaResponse, error) {
	logr := logger.Default()
	client := utils.NewInternalClient()

	// BƯỚC 1: Query tất cả available areas từ Venue domain (cùng DB)
	query := `
		SELECT va.area_id, va.area_name, va.floor, va.capacity, v.venue_id, v.venue_name, v.location
		FROM Venue_Area va
		JOIN Venue v ON va.venue_id = v.venue_id
		WHERE va.status = 'AVAILABLE' 
		AND v.status = 'AVAILABLE'
		ORDER BY v.venue_name, va.area_name
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query available areas: %w", err)
	}
	defer rows.Close()

	var allAreas []models.FreeAreaResponse
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
		allAreas = append(allAreas, area)
	}

	// BƯỚC 2: Gọi event-lambda → lấy danh sách area_id đã bận
	baseURL := utils.GetEventServiceURL() + "/internal/events/busy-areas"
	params := map[string]string{
		"startTime": startTime,
		"endTime":   endTime,
	}

	var busyResp busyAreasResponse
	statusCode, err := client.GetJSON(ctx, baseURL, params, &busyResp)
	if err != nil {
		logr.Warn("[VENUE_COMPOSED] Failed to get busy areas from event-lambda: %v, falling back to DB query", err)
		return r.GetFreeAreas(ctx, startTime, endTime)
	}

	if statusCode != 200 {
		logr.Warn("[VENUE_COMPOSED] Event service returned status %d for busy-areas, falling back to DB", statusCode)
		return r.GetFreeAreas(ctx, startTime, endTime)
	}

	// BƯỚC 3: Filter - loại bỏ area đã bận
	busySet := make(map[int]bool, len(busyResp.AreaIDs))
	for _, id := range busyResp.AreaIDs {
		busySet[id] = true
	}

	var freeAreas []models.FreeAreaResponse
	for _, area := range allAreas {
		if !busySet[area.AreaID] {
			freeAreas = append(freeAreas, area)
		}
	}

	logr.Info("[VENUE_COMPOSED] ✅ GetFreeAreasComposed: total=%d, busy=%d, free=%d", len(allAreas), len(busyResp.AreaIDs), len(freeAreas))
	return freeAreas, nil
}

// ============================================================
// 3. GetAllSeatsComposed - Lấy seats với category info từ API
//    Thay thế: LEFT JOIN category_ticket ct
//    Bước 1: Query Seat (venue domain only)
//    Bước 2: Gọi ticket-lambda → lấy category info
// ============================================================

// categoryTicketInfo dữ liệu category ticket từ ticket-lambda
type categoryTicketInfo struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	Name             string  `json:"name"`
	Price            float64 `json:"price"`
}

func (r *VenueRepository) GetAllSeatsComposed(ctx context.Context, areaID int) ([]models.Seat, error) {
	logr := logger.Default()
	client := utils.NewInternalClient()

	// BƯỚC 1: Query Seat table only (venue domain)
	query := `
		SELECT 
			s.seat_id,
			s.area_id,
			s.seat_code,
			s.status AS seat_status,
			s.row_no,
			s.col_no,
			s.category_ticket_id
		FROM Seat s
		WHERE s.area_id = ?
		ORDER BY s.row_no, s.col_no
	`

	rows, err := r.db.QueryContext(ctx, query, areaID)
	if err != nil {
		return nil, fmt.Errorf("failed to query seats: %w", err)
	}
	defer rows.Close()

	var seats []models.Seat
	categoryIDs := map[int]bool{}

	for rows.Next() {
		var seat models.Seat
		var row sql.NullString
		var column sql.NullInt64
		var categoryTicketID sql.NullInt64

		err := rows.Scan(
			&seat.SeatID,
			&seat.AreaID,
			&seat.SeatCode,
			&seat.Status,
			&row,
			&column,
			&categoryTicketID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan seat: %w", err)
		}

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
			categoryIDs[cid] = true
		}

		seats = append(seats, seat)
	}

	// BƯỚC 2: Gọi ticket-lambda → lấy category names
	if len(categoryIDs) > 0 {
		categoryMap := map[int]*categoryTicketInfo{}

		for catID := range categoryIDs {
			var cat categoryTicketInfo
			baseURL := utils.GetTicketServiceURL() + "/internal/category-ticket/info"
			params := map[string]string{"id": strconv.Itoa(catID)}

			statusCode, err := client.GetJSON(ctx, baseURL, params, &cat)
			if err != nil {
				logr.Warn("[VENUE_COMPOSED] Failed to fetch category %d: %v", catID, err)
				continue
			}
			if statusCode == 200 {
				categoryMap[cat.CategoryTicketID] = &cat
			}
		}

		// Map category info vào seats
		for i := range seats {
			if seats[i].CategoryTicketID != nil {
				if cat, ok := categoryMap[*seats[i].CategoryTicketID]; ok {
					seats[i].CategoryName = &cat.Name
					seats[i].SeatType = &cat.Name
				}
			}
		}
	}

	logr.Info("[VENUE_COMPOSED] ✅ GetAllSeatsComposed: areaId=%d, seatCount=%d", areaID, len(seats))
	return seats, nil
}

// ============================================================
// 4. GetSeatsForEventComposed - Lấy seats cho event cụ thể
//    Thay thế: JOIN Event + category_ticket + Ticket
//    Bước 1: Gọi event-lambda → lấy area_id
//    Bước 2: Query Seat (venue domain)
//    Bước 3: Gọi ticket-lambda song song → category info + booking status
// ============================================================

// eventAreaResponse response từ event-lambda
type eventAreaResponse struct {
	EventID int `json:"eventId"`
	AreaID  int `json:"areaId"`
}

// seatBookingStatus response từ ticket-lambda → trạng thái booking của seat
type seatBookingStatus struct {
	SeatID int    `json:"seatId"`
	Status string `json:"status"` // AVAILABLE, BOOKED, HOLD
}

// seatBookingResponse response wrapper
type seatBookingResponse struct {
	Statuses []seatBookingStatus `json:"statuses"`
}

func (r *VenueRepository) GetSeatsForEventComposed(ctx context.Context, eventID int, seatType string) ([]models.Seat, error) {
	logr := logger.Default()
	client := utils.NewInternalClient()

	// BƯỚC 1: Gọi event-lambda → lấy area_id cho event
	var eventArea eventAreaResponse
	baseURL := utils.GetEventServiceURL() + "/internal/events/area"
	params := map[string]string{"eventId": strconv.Itoa(eventID)}

	statusCode, err := client.GetJSON(ctx, baseURL, params, &eventArea)
	if err != nil || statusCode != 200 {
		logr.Warn("[VENUE_COMPOSED] Failed to get area_id for event %d via API: %v, falling back to DB", eventID, err)
		return r.GetSeatsForEvent(ctx, eventID, seatType)
	}

	areaID := eventArea.AreaID
	logr.Info("[VENUE_COMPOSED] Event %d → area_id=%d", eventID, areaID)

	// BƯỚC 2: Query Seat table (venue domain only)
	seatQuery := `
		SELECT 
			s.seat_id,
			s.area_id,
			s.seat_code,
			s.row_no AS seat_row,
			s.col_no AS seat_column,
			s.category_ticket_id
		FROM Seat s
		WHERE s.area_id = ?
		AND s.status = 'ACTIVE'
		ORDER BY s.row_no, s.col_no, s.seat_code
	`

	rows, err := r.db.QueryContext(ctx, seatQuery, areaID)
	if err != nil {
		return nil, fmt.Errorf("failed to query seats: %w", err)
	}
	defer rows.Close()

	var seats []models.Seat
	var seatIDs []int
	categoryIDs := map[int]bool{}

	for rows.Next() {
		var seat models.Seat
		var rowName sql.NullString
		var colNumber sql.NullInt64
		var categoryTicketID sql.NullInt64

		err := rows.Scan(
			&seat.SeatID,
			&seat.AreaID,
			&seat.SeatCode,
			&rowName,
			&colNumber,
			&categoryTicketID,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan seat: %w", err)
		}

		seat.AreaID = areaID // Ensure correct area ID

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
			categoryIDs[cid] = true
		}

		seat.Status = "AVAILABLE" // Default, will be updated from ticket-lambda
		seats = append(seats, seat)
		seatIDs = append(seatIDs, seat.SeatID)
	}

	// BƯỚC 3: Gọi song song ticket-lambda + event-lambda
	var (
		categoryMap = map[int]*categoryTicketInfo{}
		statusMap   = map[int]string{}
		wg          sync.WaitGroup
		mu          sync.Mutex
	)

	// 3a. Gọi ticket-lambda → category info cho event cụ thể
	wg.Add(1)
	go func() {
		defer wg.Done()
		var categories []categoryTicketInfo
		catURL := utils.GetTicketServiceURL() + "/internal/category-tickets/by-event"
		catParams := map[string]string{"eventId": strconv.Itoa(eventID)}

		sc, err := client.GetJSON(ctx, catURL, catParams, &categories)
		if err != nil {
			logr.Warn("[VENUE_COMPOSED] Failed to fetch categories for event %d: %v", eventID, err)
			return
		}
		if sc == 200 {
			mu.Lock()
			for i := range categories {
				cat := categories[i]
				categoryMap[cat.CategoryTicketID] = &cat
			}
			mu.Unlock()
		}
	}()

	// 3b. Gọi ticket-lambda → booking status cho từng seat
	wg.Add(1)
	go func() {
		defer wg.Done()
		if len(seatIDs) == 0 {
			return
		}

		var bookingResp seatBookingResponse
		bookingURL := utils.GetTicketServiceURL() + "/internal/tickets/seat-statuses"

		// Build seat IDs as comma-separated string
		seatIDStrs := make([]string, len(seatIDs))
		for i, id := range seatIDs {
			seatIDStrs[i] = strconv.Itoa(id)
		}

		bookingParams := map[string]string{
			"eventId": strconv.Itoa(eventID),
			"seatIds": joinInts(seatIDs),
		}

		sc, err := client.GetJSON(ctx, bookingURL, bookingParams, &bookingResp)
		if err != nil {
			logr.Warn("[VENUE_COMPOSED] Failed to fetch seat statuses for event %d: %v", eventID, err)
			return
		}
		if sc == 200 {
			mu.Lock()
			for _, s := range bookingResp.Statuses {
				statusMap[s.SeatID] = s.Status
			}
			mu.Unlock()
		}
	}()

	wg.Wait()

	// LOG: In ra categoryMap để biết event có những category nào
	// ❌ DISABLED: Comment out detailed category logs to reduce spam
	// logr.Info("[DEBUG_SEAT] eventId=%d → categoryMap có %d loại vé:", eventID, len(categoryMap))
	// for cid, cat := range categoryMap {
	// 	logr.Info("[DEBUG_SEAT]   CategoryID=%d Name=%s Price=%.0f", cid, cat.Name, cat.Price)
	// }

	// BƯỚC 4: Map dữ liệu vào seats
	// CHỈ giữ lại ghế có categoryTicketID thuộc về event này (tồn tại trong categoryMap).
	// Ghế không có categoryTicketID hoặc categoryTicketID không nằm trong event → bỏ qua.
	filteredSeats := make([]models.Seat, 0, len(seats))
	for i := range seats {
		// Đảm bảo AreaID luôn được gán đúng (tránh null khi scan từ DB)
		seats[i].AreaID = areaID

		// Bỏ qua ghế chưa được phân bổ category_ticket_id
		if seats[i].CategoryTicketID == nil {
			// ❌ DISABLED: logr.Info("[DEBUG_SEAT] Ghế %s có CategoryID=nil | Có trong Event không? false → BỎ QUA", seats[i].SeatCode)
			continue
		}

		// Bỏ qua ghế có category_ticket_id không thuộc event này
		cat, ok := categoryMap[*seats[i].CategoryTicketID]
		// ❌ DISABLED: logr.Info("[DEBUG_SEAT] Ghế %s có CategoryID=%d | Có trong Event không? %v", seats[i].SeatCode, *seats[i].CategoryTicketID, ok)
		if !ok {
			continue
		}

		// Ghế thuộc event → map category info
		catName := cat.Name
		seats[i].CategoryName = &catName
		seats[i].SeatType = &catName
		seats[i].Price = &cat.Price

		// Map booking status
		if status, ok := statusMap[seats[i].SeatID]; ok {
			seats[i].Status = status
		}

		// Filter by seatType nếu caller chỉ muốn 1 loại cụ thể
		if seatType != "" {
			if *seats[i].CategoryName != seatType {
				continue
			}
		}

		filteredSeats = append(filteredSeats, seats[i])
	}

	log.Printf("[VENUE_COMPOSED] ✅ GetSeatsForEventComposed: eventId=%d, areaId=%d, total=%d, filtered=%d",
		eventID, areaID, len(seats), len(filteredSeats))

	return filteredSeats, nil
}

// joinInts converts []int to comma-separated string
func joinInts(ids []int) string {
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = strconv.Itoa(id)
	}
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += ","
		}
		result += s
	}
	return result
}
