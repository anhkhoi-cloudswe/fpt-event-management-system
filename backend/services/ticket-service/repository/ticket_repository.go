package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fpt-event-services/common/config"
	apperrors "github.com/fpt-event-services/common/errors"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/qrcode"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/ticket-service/models"
)

type UserPenalty struct {
	FailedCheckoutCount int
	LockedUntil         time.Time
}

var (
	userPenalties = make(map[int]*UserPenalty)
	penaltyMutex  sync.RWMutex
)

func incrementUserPenalty(userID int) {
	penaltyMutex.Lock()
	defer penaltyMutex.Unlock()

	p, ok := userPenalties[userID]
	if !ok {
		p = &UserPenalty{}
		userPenalties[userID] = p
	}

	// Reset expired lock first
	if !p.LockedUntil.IsZero() && time.Now().After(p.LockedUntil) {
		p.FailedCheckoutCount = 0
		p.LockedUntil = time.Time{}
	}

	p.FailedCheckoutCount++
	if p.FailedCheckoutCount >= 3 {
		p.LockedUntil = time.Now().Add(15 * time.Minute)
		p.FailedCheckoutCount = 0
		logger.Default().Info("[SECURITY] 🔒 User locked out for 15 minutes due to seat hoarding", "user_id", userID)
	}
}

type TicketRepository struct {
	db *sql.DB
}

// NewTicketRepositoryWithDB creates a new ticket repository with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton db.GetDB() allowed
func NewTicketRepositoryWithDB(dbConn *sql.DB) *TicketRepository {
	return &TicketRepository{
		db: dbConn,
	}
}

// ============================================================
// GetTicketsByUserID - Lấy danh sách vé của user
// KHỚP VỚI Java: TicketDAO.getTicketsByUserId()
// ============================================================
func (r *TicketRepository) GetTicketsByUserID(ctx context.Context, userID int) ([]models.MyTicketResponse, error) {
	query := `
		SELECT 
			t.ticket_id,
			t.qr_code_value,
			e.title AS event_name,
			v.venue_name,
			e.start_time,
			t.status,
			t.checkin_time,
			t.check_out_time,
			ct.name AS category,
			ct.price AS category_price,
			s.seat_code,
			u.full_name AS buyer_name,
			e.start_time AS purchase_date,
			e.banner_url
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE t.user_id = $1
		ORDER BY t.ticket_id DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets: %w", err)
	}
	defer rows.Close()

	tickets := []models.MyTicketResponse{}
	for rows.Next() {
		var ticket models.MyTicketResponse
		var (
			ticketCode    sql.NullString
			eventName     sql.NullString
			venueName     sql.NullString
			startTime     sql.NullTime
			checkinTime   sql.NullTime
			checkoutTime  sql.NullTime
			category      sql.NullString
			categoryPrice sql.NullFloat64
			seatCode      sql.NullString
			buyerName     sql.NullString
			purchaseDate  sql.NullTime
			bannerURL     sql.NullString
		)

		err := rows.Scan(
			&ticket.TicketID,
			&ticketCode,
			&eventName,
			&venueName,
			&startTime,
			&ticket.Status,
			&checkinTime,
			&checkoutTime,
			&category,
			&categoryPrice,
			&seatCode,
			&buyerName,
			&purchaseDate,
			&bannerURL,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ticket: %w", err)
		}

		if ticketCode.Valid {
			ticket.TicketCode = &ticketCode.String
		}
		if eventName.Valid {
			ticket.EventName = &eventName.String
		}
		if venueName.Valid {
			ticket.VenueName = &venueName.String
		}
		if startTime.Valid {
			ticket.StartTime = &startTime.Time
		}
		if checkinTime.Valid {
			ticket.CheckInTime = &checkinTime.Time
		}
		if checkoutTime.Valid {
			ticket.CheckOutTime = &checkoutTime.Time
		}
		if category.Valid {
			ticket.Category = &category.String
		}
		if categoryPrice.Valid {
			ticket.CategoryPrice = &categoryPrice.Float64
		}
		if seatCode.Valid {
			ticket.SeatCode = &seatCode.String
		}
		if buyerName.Valid {
			ticket.BuyerName = &buyerName.String
		}
		if purchaseDate.Valid {
			ticket.PurchaseDate = &purchaseDate.Time
		}
		if bannerURL.Valid {
			ticket.BannerURL = &bannerURL.String
		}

		tickets = append(tickets, ticket)
	}

	return tickets, nil
}

// ============================================================
// GetTicketsByUserIDPaginated - Lấy danh sách vé với pagination và search/filter
// ============================================================
func (r *TicketRepository) GetTicketsByUserIDPaginated(ctx context.Context, userID, page, limit int, search, status string) (*models.PaginatedTicketsResponse, error) {
	offset := (page - 1) * limit

	// Build query với WHERE conditions
	whereConditions := []string{"t.user_id = $1"}
	args := []interface{}{userID}

	// Search theo tên sự kiện
	if search != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("e.title LIKE $%d", len(args)+1))
		args = append(args, "%"+search+"%")
	}

	// Filter theo status
	if status != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("t.status = $%d", len(args)+1))
		args = append(args, status)
	}

	whereClause := strings.Join(whereConditions, " AND ")

	// Count total records
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

	// Query tickets với pagination
	query := fmt.Sprintf(`
		SELECT 
			t.ticket_id,
			t.qr_code_value,
			e.title AS event_name,
			v.venue_name,
			e.start_time,
			t.status,
			t.checkin_time,
			t.check_out_time,
			ct.name AS category,
			ct.price AS category_price,
			s.seat_code,
			u.full_name AS buyer_name,
			e.start_time AS purchase_date,
			e.banner_url
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE %s
		ORDER BY t.ticket_id DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, len(args)+1, len(args)+2)

	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets: %w", err)
	}
	defer rows.Close()

	tickets := []models.MyTicketResponse{}
	for rows.Next() {
		var ticket models.MyTicketResponse
		var (
			ticketCode    sql.NullString
			eventName     sql.NullString
			venueName     sql.NullString
			startTime     sql.NullTime
			checkinTime   sql.NullTime
			checkoutTime  sql.NullTime
			category      sql.NullString
			categoryPrice sql.NullFloat64
			seatCode      sql.NullString
			buyerName     sql.NullString
			purchaseDate  sql.NullTime
			bannerURL     sql.NullString
		)

		err := rows.Scan(
			&ticket.TicketID,
			&ticketCode,
			&eventName,
			&venueName,
			&startTime,
			&ticket.Status,
			&checkinTime,
			&checkoutTime,
			&category,
			&categoryPrice,
			&seatCode,
			&buyerName,
			&purchaseDate,
			&bannerURL,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ticket: %w", err)
		}

		if ticketCode.Valid {
			ticket.TicketCode = &ticketCode.String
		}
		if eventName.Valid {
			ticket.EventName = &eventName.String
		}
		if venueName.Valid {
			ticket.VenueName = &venueName.String
		}
		if startTime.Valid {
			ticket.StartTime = &startTime.Time
		}
		if checkinTime.Valid {
			ticket.CheckInTime = &checkinTime.Time
		}
		if checkoutTime.Valid {
			ticket.CheckOutTime = &checkoutTime.Time
		}
		if category.Valid {
			ticket.Category = &category.String
		}
		if categoryPrice.Valid {
			ticket.CategoryPrice = &categoryPrice.Float64
		}
		if seatCode.Valid {
			ticket.SeatCode = &seatCode.String
		}
		if buyerName.Valid {
			ticket.BuyerName = &buyerName.String
		}
		if purchaseDate.Valid {
			ticket.PurchaseDate = &purchaseDate.Time
		}
		if bannerURL.Valid {
			ticket.BannerURL = &bannerURL.String
		}

		tickets = append(tickets, ticket)
	}

	return &models.PaginatedTicketsResponse{
		Tickets:      tickets,
		TotalPages:   totalPages,
		CurrentPage:  page,
		TotalRecords: totalRecords,
	}, nil
}

// ============================================================
// GetTicketsByRole - Lấy danh sách vé theo role (ADMIN/STAFF/ORGANIZER)
// KHỚP VỚI Java: TicketDAO.getTicketsByRole()
// ============================================================
func (r *TicketRepository) GetTicketsByRole(ctx context.Context, role string, userID int, eventID *int, limit, offset int) ([]models.MyTicketResponse, int, error) {
	var query string
	var args []interface{}

	var countQuery string
	var countArgs []interface{}

	switch role {
	case "ADMIN", "STAFF":
		if eventID != nil {
			countQuery = "SELECT COUNT(*) FROM Ticket t WHERE t.event_id = $1"
			countArgs = append(countArgs, *eventID)
		} else {
			countQuery = "SELECT COUNT(*) FROM Ticket t"
		}
	case "ORGANIZER":
		if eventID != nil {
			countQuery = "SELECT COUNT(*) FROM Ticket t JOIN Event e ON t.event_id = e.event_id WHERE e.created_by = $1 AND t.event_id = $2"
			countArgs = append(countArgs, userID, *eventID)
		} else {
			countQuery = "SELECT COUNT(*) FROM Ticket t JOIN Event e ON t.event_id = e.event_id WHERE e.created_by = $1"
			countArgs = append(countArgs, userID)
		}
	default:
		countQuery = "SELECT COUNT(*) FROM Ticket t WHERE t.user_id = $1"
		countArgs = append(countArgs, userID)
	}

	var totalCount int
	err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count tickets: %w", err)
	}

	baseQuery := `
		SELECT 
			t.ticket_id,
			t.qr_code_value,
			e.title AS event_name,
			v.venue_name,
			e.start_time,
			t.status,
			t.checkin_time,
			t.check_out_time,
			ct.name AS category,
			ct.price AS category_price,
			s.seat_code,
			u.full_name AS buyer_name,
			u.email AS buyer_email,
			t.created_at AS purchase_date
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Users u ON t.user_id = u.user_id
	`

	switch role {
	case "ADMIN", "STAFF":
		// Admin/Staff see all tickets, optionally filtered by eventId
		if eventID != nil {
			query = baseQuery + " WHERE t.event_id = $1 ORDER BY t.ticket_id DESC"
			args = append(args, *eventID)
		} else {
			query = baseQuery + " ORDER BY t.ticket_id DESC"
		}
	case "ORGANIZER":
		// Organizer sees tickets for their events only
		if eventID != nil {
			query = baseQuery + " WHERE e.created_by = $1 AND t.event_id = $2 ORDER BY t.ticket_id DESC"
			args = append(args, userID, *eventID)
		} else {
			query = baseQuery + " WHERE e.created_by = $1 ORDER BY t.ticket_id DESC"
			args = append(args, userID)
		}
	default:
		// Regular user sees only their own tickets
		query = baseQuery + " WHERE t.user_id = $1 ORDER BY t.ticket_id DESC"
		args = append(args, userID)
	}

	if limit >= 0 && offset >= 0 {
		query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
		args = append(args, limit, offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query tickets by role: %w", err)
	}
	defer rows.Close()

	tickets := []models.MyTicketResponse{}
	for rows.Next() {
		var ticket models.MyTicketResponse
		var (
			ticketCode    sql.NullString
			eventName     sql.NullString
			venueName     sql.NullString
			startTime     sql.NullTime
			checkinTime   sql.NullTime
			checkoutTime  sql.NullTime
			category      sql.NullString
			categoryPrice sql.NullFloat64
			seatCode      sql.NullString
			buyerName     sql.NullString
			buyerEmail    sql.NullString
			purchaseDate  sql.NullTime
		)

		err := rows.Scan(
			&ticket.TicketID,
			&ticketCode,
			&eventName,
			&venueName,
			&startTime,
			&ticket.Status,
			&checkinTime,
			&checkoutTime,
			&category,
			&categoryPrice,
			&seatCode,
			&buyerName,
			&buyerEmail,
			&purchaseDate,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan ticket: %w", err)
		}

		if ticketCode.Valid {
			ticket.TicketCode = &ticketCode.String
		}
		if eventName.Valid {
			ticket.EventName = &eventName.String
		}
		if venueName.Valid {
			ticket.VenueName = &venueName.String
		}
		if startTime.Valid {
			ticket.StartTime = &startTime.Time
		}
		if checkinTime.Valid {
			ticket.CheckInTime = &checkinTime.Time
		}
		if checkoutTime.Valid {
			ticket.CheckOutTime = &checkoutTime.Time
		}
		if category.Valid {
			ticket.Category = &category.String
		}
		if categoryPrice.Valid {
			ticket.CategoryPrice = &categoryPrice.Float64
		}
		if seatCode.Valid {
			ticket.SeatCode = &seatCode.String
		}
		if buyerName.Valid {
			ticket.BuyerName = &buyerName.String
		}
		if buyerEmail.Valid {
			ticket.BuyerEmail = &buyerEmail.String
		}
		if purchaseDate.Valid {
			ticket.PurchaseDate = &purchaseDate.Time
		}

		tickets = append(tickets, ticket)
	}

	return tickets, totalCount, nil
}

// ============================================================
// GetCategoryTicketsByEventID - Lấy các loại vé của event
// ✅ FIX: Tính Remaining = MaxQuantity - COUNT(sold/pending tickets) để frontend hiển thị đúng "Còn lại"
// ============================================================
func (r *TicketRepository) GetCategoryTicketsByEventID(ctx context.Context, eventID int) ([]models.CategoryTicket, error) {
	fmt.Printf("[TICKET] GetCategoryTicketsByEventID - EventID: %d\n", eventID)

	query := `
		SELECT 
			ct.category_ticket_id,
			ct.event_id,
			ct.name,
			ct.description,
			ct.price,
			ct.max_quantity,
			ct.status,
			COALESCE(ct.max_quantity, 0) - COALESCE((SELECT COUNT(*) FROM Ticket t WHERE t.category_ticket_id = ct.category_ticket_id AND t.status IN ('PENDING', 'BOOKED', 'CHECKED_IN')), 0) AS remaining
		FROM Category_Ticket ct
		WHERE ct.event_id = $1
		ORDER BY ct.price ASC
	`

	rows, err := r.db.QueryContext(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("failed to query category tickets: %w", err)
	}
	defer rows.Close()

	tickets := []models.CategoryTicket{}
	for rows.Next() {
		var ct models.CategoryTicket
		var description sql.NullString

		err := rows.Scan(
			&ct.CategoryTicketID,
			&ct.EventID,
			&ct.Name,
			&description,
			&ct.Price,
			&ct.MaxQuantity,
			&ct.Status,
			&ct.Remaining,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan category ticket: %w", err)
		}

		if description.Valid {
			ct.Description = &description.String
		}

		remainingVal := 0
		if ct.Remaining != nil {
			remainingVal = *ct.Remaining
		}
		maxQtyVal := 0
		if ct.MaxQuantity != nil {
			maxQtyVal = *ct.MaxQuantity
		}
		fmt.Printf("[TICKET] Category: %s | Giá: %.0f VNĐ | Còn lại: %d/%d\n",
			ct.Name, ct.Price, remainingVal, maxQtyVal)

		tickets = append(tickets, ct)
	}

	fmt.Printf("[TICKET] GetCategoryTicketsByEventID - Tổng số loại vé: %d\n", len(tickets))
	return tickets, nil
}

// ============================================================
// GetBillsByUserID - Lấy danh sách hóa đơn của user
// ============================================================
func (r *TicketRepository) GetBillsByUserID(ctx context.Context, userID int) ([]models.MyBillResponse, error) {
	fmt.Printf("[DEBUG] GetBillsByUserID - userID: %d\n", userID)

	// Simplified query - không dùng Bill_Detail vì có thể chưa có bảng hoặc data
	query := `
		SELECT 
			b.bill_id,
			b.total_amount,
			b.payment_method,
			b.payment_status,
			b.created_at
		FROM Bill b
		WHERE b.user_id = $1
		ORDER BY b.created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		fmt.Printf("[ERROR] GetBillsByUserID - SQL error: %v\n", err)
		return nil, fmt.Errorf("failed to query bills: %w", err)
	}
	defer rows.Close()

	bills := []models.MyBillResponse{}
	for rows.Next() {
		var bill models.MyBillResponse
		var paymentMethod sql.NullString

		err := rows.Scan(
			&bill.BillID,
			&bill.TotalAmount,
			&paymentMethod,
			&bill.PaymentStatus,
			&bill.CreatedAt,
		)
		if err != nil {
			fmt.Printf("[ERROR] GetBillsByUserID - Scan error: %v\n", err)
			return nil, fmt.Errorf("failed to scan bill: %w", err)
		}

		if paymentMethod.Valid {
			bill.PaymentMethod = &paymentMethod.String
		}

		bill.CreatedAt = utils.ToVietnamTime(bill.CreatedAt)
		if bill.PaidAt != nil {
			paidAt := utils.ToVietnamTime(*bill.PaidAt)
			bill.PaidAt = &paidAt
		}

		// Set default values for fields we can't get without Bill_Detail
		defaultEventName := "Event"
		bill.EventName = &defaultEventName
		bill.TicketCount = 1

		bills = append(bills, bill)
	}

	fmt.Printf("[DEBUG] GetBillsByUserID - Found %d bills\n", len(bills))
	return bills, nil
}

// ============================================================
// GetBillsByUserIDPaginated - Lấy danh sách hóa đơn với pagination và search/filter
// ============================================================
func (r *TicketRepository) GetBillsByUserIDPaginated(ctx context.Context, userID, page, limit int, search, paymentStatus, paymentMethod string) (*models.PaginatedBillsResponse, error) {
	fmt.Printf("[DEBUG] GetBillsByUserIDPaginated - userID: %d, page: %d, limit: %d, search: %s, status: %s, method: %s\n",
		userID, page, limit, search, paymentStatus, paymentMethod)

	offset := (page - 1) * limit

	// Build query với WHERE conditions
	whereConditions := []string{"b.user_id = $1"}
	args := []interface{}{userID}

	// Search theo mã hóa đơn
	if search != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("CAST(b.bill_id AS VARCHAR) LIKE $%d", len(args)+1))
		args = append(args, "%"+search+"%")
	}

	// Filter theo payment status
	if paymentStatus != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("b.payment_status = $%d", len(args)+1))
		args = append(args, paymentStatus)
	}

	// Filter theo payment method
	if paymentMethod != "" {
		whereConditions = append(whereConditions, fmt.Sprintf("b.payment_method = $%d", len(args)+1))
		args = append(args, paymentMethod)
	}

	whereClause := strings.Join(whereConditions, " AND ")

	// Count total records
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM Bill b
		WHERE %s
	`, whereClause)

	var totalRecords int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords)
	if err != nil {
		fmt.Printf("[ERROR] GetBillsByUserIDPaginated - Count error: %v\n", err)
		return nil, fmt.Errorf("failed to count bills: %w", err)
	}

	totalPages := (totalRecords + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	// Query bills với pagination
	query := fmt.Sprintf(`
		SELECT 
			b.bill_id,
			b.total_amount,
			b.payment_method,
			b.payment_status,
			b.created_at
		FROM Bill b
		WHERE %s
		ORDER BY b.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, len(args)+1, len(args)+2)

	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		fmt.Printf("[ERROR] GetBillsByUserIDPaginated - Query error: %v\n", err)
		return nil, fmt.Errorf("failed to query bills: %w", err)
	}
	defer rows.Close()

	bills := []models.MyBillResponse{}
	for rows.Next() {
		var bill models.MyBillResponse
		var paymentMethodVal sql.NullString

		err := rows.Scan(
			&bill.BillID,
			&bill.TotalAmount,
			&paymentMethodVal,
			&bill.PaymentStatus,
			&bill.CreatedAt,
		)
		if err != nil {
			fmt.Printf("[ERROR] GetBillsByUserIDPaginated - Scan error: %v\n", err)
			return nil, fmt.Errorf("failed to scan bill: %w", err)
		}

		if paymentMethodVal.Valid {
			bill.PaymentMethod = &paymentMethodVal.String
		}

		bill.CreatedAt = utils.ToVietnamTime(bill.CreatedAt)
		if bill.PaidAt != nil {
			paidAt := utils.ToVietnamTime(*bill.PaidAt)
			bill.PaidAt = &paidAt
		}

		// Set default values
		defaultEventName := "Event"
		bill.EventName = &defaultEventName
		bill.TicketCount = 1

		bills = append(bills, bill)
	}

	fmt.Printf("[DEBUG] GetBillsByUserIDPaginated - Found %d bills\n", len(bills))
	return &models.PaginatedBillsResponse{
		Bills:        bills,
		TotalPages:   totalPages,
		CurrentPage:  page,
		TotalRecords: totalRecords,
	}, nil
}


// CreateBankTransferOrder - Tạo đơn hàng thanh toán chuyển khoản ngân hàng (SePay)
// Trả về order_id (bill_id) và amount
func (r *TicketRepository) CreateBankTransferOrder(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int) (int64, float64, error) {
	// Auto release expired bills first (Lazy Expiry Evaluation)
	r.AutoReleaseExpiredPendingBills(ctx)

	// Rule 2 check: Check if user is locked out due to seat hoarding
	penaltyMutex.RLock()
	penalty, exists := userPenalties[userID]
	if exists && !penalty.LockedUntil.IsZero() && time.Now().Before(penalty.LockedUntil) {
		remainingSeconds := int(penalty.LockedUntil.Sub(time.Now()).Seconds())
		penaltyMutex.RUnlock()
		return 0, 0, apperrors.BusinessError(fmt.Sprintf("[E4003]|%d", remainingSeconds))
	}
	penaltyMutex.RUnlock()

	// Rule 1 check: Limiting user to max 1 active PENDING bill with Smart Resume Flow
	var pendingBillID int64
	var createdAt time.Time
	pendingErr := r.db.QueryRowContext(ctx, "SELECT bill_id, created_at FROM Bill WHERE user_id = $1 AND payment_status = 'PENDING'", userID).Scan(&pendingBillID, &createdAt)
	if pendingErr == nil {
		remainingSeconds := 300 - int(time.Now().Sub(createdAt).Seconds())
		if remainingSeconds < 0 {
			remainingSeconds = 0
		}

		rows, seatErr := r.db.QueryContext(ctx, `
			SELECT t.event_id, t.category_ticket_id, t.seat_id, s.seat_code 
			FROM Ticket t
			JOIN Seat s ON t.seat_id = s.seat_id
			WHERE t.bill_id = $1 AND t.status = 'PENDING'
		`, pendingBillID)

		var evID int
		var catID int
		var seatIDsList []string
		var seatCodes []string
		var pendingSeatIDs []int

		if seatErr == nil {
			defer rows.Close()
			for rows.Next() {
				var eID, cID, seatID int
				var code string
				if scanErr := rows.Scan(&eID, &cID, &seatID, &code); scanErr == nil {
					evID = eID
					catID = cID
					seatIDsList = append(seatIDsList, strconv.Itoa(seatID))
					seatCodes = append(seatCodes, code)
					pendingSeatIDs = append(pendingSeatIDs, seatID)
				}
			}
		}

		// Check if request seatIDs match the pending bill's seatIDs exactly
		if equalIntSlices(pendingSeatIDs, seatIDs) {
			var totalAmount float64
			err := r.db.QueryRowContext(ctx, "SELECT total_amount FROM Bill WHERE bill_id = $1", pendingBillID).Scan(&totalAmount)
			if err == nil {
				return pendingBillID, totalAmount, nil
			}
		}

		seatsStr := strings.Join(seatCodes, ",")
		seatIDsStr := strings.Join(seatIDsList, ",")

		return 0, 0, apperrors.BusinessError(fmt.Sprintf("[E4002]|%d|%s|%s|%d|%d|%d", pendingBillID, seatsStr, seatIDsStr, evID, catID, remainingSeconds))
	}

	log := logger.Default().WithContext(ctx)
	fmt.Printf("[CreateBankTransferOrder] Called - userID=%d, eventID=%d, categoryTicketID=%d, seatIDs=%v\n", userID, eventID, categoryTicketID, seatIDs)

	// Validate số lượng ghế (max 4)
	if len(seatIDs) == 0 {
		return 0, 0, apperrors.BusinessError("Vui lòng chọn ít nhất 1 ghế")
	}
	if len(seatIDs) > 4 {
		return 0, 0, apperrors.BusinessError("Chỉ được mua tối đa 4 ghế mỗi lần")
	}

	// Kiểm tra event có tồn tại và đang active không
	var eventTitle string
	var status string
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, "SELECT title, status, start_time FROM Event WHERE event_id = $1", eventID).Scan(&eventTitle, &status, &startTime)
	if err != nil {
		log.Error("Event not found", "event_id", eventID, "error", err)
		return 0, 0, apperrors.NotFound("Sự kiện")
	}
	if status != "OPEN" {
		log.Warn("Event not open", "event_id", eventID, "status", status)
		return 0, 0, apperrors.BusinessError(fmt.Sprintf("Sự kiện không mở bán vé (trạng thái: %s)", status))
	}

	// Kiểm tra xem event đã bắt đầu chưa
	now := time.Now()
	if now.After(startTime) || now.Equal(startTime) {
		log.Warn("[BOOKING_SECURITY] User blocked from buying ticket for event that has started",
			"user_id", userID, "event_id", eventID, "event_start_time", startTime, "current_time", now)
		return 0, 0, apperrors.BusinessError("Sự kiện đã bắt đầu hoặc kết thúc, không thể đặt vé")
	}

	// Bắt đầu database transaction để tạo Bill và Tickets đồng thời
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, apperrors.DatabaseError(err)
	}
	defer tx.Rollback()

	var totalAmount float64
	type categoryInfo struct {
		Name      string
		Price     float64
		MaxQty    int
		SoldCount int
		Requested int
	}
	categoryMap := make(map[int]*categoryInfo)
	resolvedCategoryTicketID := categoryTicketID

	for _, seatID := range seatIDs {
		var seatStatus string
		var seatCategoryTicketID sql.NullInt64
		var catName sql.NullString
		var catStatus sql.NullString
		var pricePerSeat sql.NullFloat64
		var maxQty sql.NullInt64

		err = tx.QueryRowContext(ctx, `
			SELECT
				s.status,
				s.category_ticket_id,
				ct.name,
				ct.status,
				ct.price,
				ct.max_quantity
			FROM Seat s
			LEFT JOIN Category_Ticket ct
				ON s.category_ticket_id = ct.category_ticket_id
				AND ct.event_id = $1
			WHERE s.seat_id = $2
		`, eventID, seatID).Scan(&seatStatus, &seatCategoryTicketID, &catName, &catStatus, &pricePerSeat, &maxQty)
		if err != nil {
			log.Error("Seat not found", "seat_id", seatID, "error", err)
			return 0, 0, apperrors.NotFound(fmt.Sprintf("Ghế ID %d", seatID))
		}
		if seatStatus != "ACTIVE" {
			return 0, 0, apperrors.BusinessError(fmt.Sprintf("Ghế ID %d không khả dụng", seatID))
		}
		if !seatCategoryTicketID.Valid {
			return 0, 0, apperrors.BusinessError(fmt.Sprintf("Ghế ID %d chưa được gán loại vé", seatID))
		}

		currentCategoryTicketID := int(seatCategoryTicketID.Int64)
		if resolvedCategoryTicketID == 0 {
			resolvedCategoryTicketID = currentCategoryTicketID
		}

		meta, ok := categoryMap[currentCategoryTicketID]
		if !ok {
			if !catStatus.Valid || catStatus.String != "ACTIVE" {
				return 0, 0, apperrors.BusinessError(fmt.Sprintf("Loại vé của ghế ID %d không khả dụng", seatID))
			}

			var soldCount int
			if queryErr := tx.QueryRowContext(ctx,
				"SELECT COUNT(*) FROM Ticket WHERE category_ticket_id = $1 AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')",
				currentCategoryTicketID,
			).Scan(&soldCount); queryErr != nil {
				soldCount = 0
			}

			meta = &categoryInfo{
				Name:      catName.String,
				Price:     pricePerSeat.Float64,
				MaxQty:    int(maxQty.Int64),
				SoldCount: soldCount,
				Requested: 0,
			}
			categoryMap[currentCategoryTicketID] = meta
		}

		meta.Requested++
		remaining := meta.MaxQty - meta.SoldCount
		if remaining <= 0 {
			return 0, 0, apperrors.BusinessError(fmt.Sprintf("Ticket Sold Out - Loại vé '%s' đã hết. Còn lại: 0/%d", meta.Name, meta.MaxQty))
		}
		if meta.SoldCount+meta.Requested > meta.MaxQty {
			return 0, 0, apperrors.BusinessError(fmt.Sprintf("Không đủ vé cho loại '%s'. Còn lại: %d, Yêu cầu: %d", meta.Name, remaining, meta.Requested))
		}

		// RACE CONDITION CHECK: Kiểm tra ghế đã bị giữ/đặt chưa
		var existingTicketCount int
		err = tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM Ticket 
			 WHERE event_id = $1 AND seat_id = $2 AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')`,
			eventID, seatID,
		).Scan(&existingTicketCount)
		if err != nil {
			log.Error("Error checking existing tickets", "error", err)
			return 0, 0, apperrors.DatabaseError(err)
		}
		if existingTicketCount > 0 {
			log.Warn("Seat already reserved/booked", "event_id", eventID, "seat_id", seatID)
			return 0, 0, apperrors.BusinessError(fmt.Sprintf("Ghế ID %d đã được người khác giữ/đặt", seatID))
		}

		totalAmount += meta.Price
	}

	if totalAmount == 0 {
		// 1. Lock/Query user's wallet info (create if missing) to obtain walletID
		var currentBalance float64
		var walletID int
		lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
		walletErr := tx.QueryRowContext(ctx, lockQuery, userID).Scan(&walletID, &currentBalance)
		if walletErr != nil {
			if walletErr == sql.ErrNoRows {
				var walletID64 int64
				insertErr := tx.QueryRowContext(ctx,
					"INSERT INTO Wallet (user_id, balance, currency, status) VALUES ($1, 0, 'VND', 'ACTIVE') RETURNING wallet_id", userID).Scan(&walletID64)
				if insertErr != nil {
					return 0, 0, apperrors.DatabaseError(insertErr)
				}
				walletID = int(walletID64)
				currentBalance = 0
			} else {
				return 0, 0, apperrors.DatabaseError(walletErr)
			}
		}

		// 2. Generate deterministic fallback UUID
		detUUID := generateDeterministicUUID(userID, eventID, seatIDs)

		// 3. Insert transaction log into Wallet_Transaction
		_, walletTxErr := tx.ExecContext(ctx,
			`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
			 VALUES ($1, $2, 'DEBIT', 0, $3, $4, 'TICKET_PURCHASE', $5, $6)`,
			walletID, userID, currentBalance, currentBalance, detUUID, fmt.Sprintf("Mua vé miễn phí event %d", eventID),
		)
		if walletTxErr != nil {
			return 0, 0, apperrors.DatabaseError(walletTxErr)
		}

		// 4. Create free bill
		var freeBillID int64
		billErr := tx.QueryRowContext(ctx,
			`INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at)
			 VALUES ($1, 0, 'VND', 'FREE', 'PAID', NOW(), NOW()) RETURNING bill_id`,
			userID,
		).Scan(&freeBillID)
		if billErr != nil {
			return 0, 0, apperrors.DatabaseError(billErr)
		}

		bookedIDsFree := make([]int, 0)
		for _, seatID := range seatIDs {
			var seatCategoryTicketID int64
			err = tx.QueryRowContext(ctx, "SELECT category_ticket_id FROM Seat WHERE seat_id = $1", seatID).Scan(&seatCategoryTicketID)
			if err != nil {
				return 0, 0, apperrors.DatabaseError(err)
			}

			var tid int64
			err = tx.QueryRowContext(ctx,
				`INSERT INTO Ticket (user_id, event_id, category_ticket_id, bill_id, seat_id, qr_code_value, status, created_at)
				 VALUES ($1, $2, $3, $4, $5, 'PENDING_QR', 'BOOKED', NOW()) RETURNING ticket_id`,
				userID, eventID, seatCategoryTicketID, freeBillID, seatID,
			).Scan(&tid)
			if err != nil {
				return 0, 0, apperrors.DatabaseError(err)
			}

			qrBase64, qrErr := qrcode.GenerateTicketQRBase64(int(tid), 300)
			if qrErr != nil {
				qrBase64 = fmt.Sprintf("PENDING_QR_%d", tid)
			}
			_, err = tx.ExecContext(ctx, "UPDATE Ticket SET qr_code_value = $1 WHERE ticket_id = $2", qrBase64, tid)
			if err != nil {
				return 0, 0, apperrors.DatabaseError(err)
			}
			bookedIDsFree = append(bookedIDsFree, int(tid))
		}



		if err = tx.Commit(); err != nil {
			return 0, 0, apperrors.DatabaseError(err)
		}

		go r.sendMultipleTicketEmailsAsync(context.Background(), userID, eventID, bookedIDsFree, "0", resolvedCategoryTicketID, int(freeBillID))

		return freeBillID, 0, nil
	}

	// 1. Tạo Bill ở trạng thái PENDING
	var billID int64
	err = tx.QueryRowContext(ctx,
		`INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at)
		 VALUES ($1, $2, 'VND', 'BANK_TRANSFER', 'PENDING', NOW()) RETURNING bill_id`,
		userID, totalAmount,
	).Scan(&billID)
	if err != nil {
		log.Error("Failed to create pending bill", "error", err)
		return 0, 0, apperrors.DatabaseError(err)
	}

	// 2. Tạo Tickets ở trạng thái PENDING linked với bill_id
	for _, seatID := range seatIDs {
		var seatCategoryTicketID int64
		err = tx.QueryRowContext(ctx, "SELECT category_ticket_id FROM Seat WHERE seat_id = $1", seatID).Scan(&seatCategoryTicketID)
		if err != nil {
			return 0, 0, apperrors.DatabaseError(err)
		}

		var pendingTicketID int64
		err = tx.QueryRowContext(ctx,
			`INSERT INTO Ticket (user_id, event_id, category_ticket_id, bill_id, seat_id, qr_code_value, status, created_at) 
			 VALUES ($1, $2, $3, $4, $5, 'PENDING_QR', 'PENDING', NOW()) RETURNING ticket_id`,
			userID, eventID, seatCategoryTicketID, billID, seatID,
		).Scan(&pendingTicketID)
		if err != nil {
			log.Error("Failed to create pending ticket", "error", err)
			if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "ticket_event_id_seat_id_key") {
				return 0, 0, apperrors.BusinessError("Ghế đặt hiện đang nằm trong trạng thái xử lý thanh toán. Vui lòng thử lại sau ít phút hoặc chọn ghế khác!")
			}
			return 0, 0, apperrors.DatabaseError(err)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return 0, 0, apperrors.DatabaseError(err)
	}

	log.Info("[BANK_TRANSFER] Order created successfully", "bill_id", billID, "total_amount", totalAmount)
	return billID, totalAmount, nil
}

// ProcessSePayWebhook - Xử lý webhook từ SePay gửi về
func (r *TicketRepository) ProcessSePayWebhook(ctx context.Context, gateway string, amount float64, content string, transferAt string) (string, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("SePay Webhook received", "gateway", gateway, "amount", amount, "content", content, "transfer_at", transferAt)

	// 1. Phân tách chuỗi content để tìm order_id (bill_id)
	// Quét tìm từ khóa HD nằm sát các chữ số cuối cùng của chuỗi nội dung
	re := regexp.MustCompile(`HD\s*(\d+)`)
	matches := re.FindStringSubmatch(strings.ToUpper(content))
	if len(matches) < 2 {
		log.Warn("SePay Webhook: Invalid content format (missing HD{order_id})", "content", content)
		return "", fmt.Errorf("invalid transaction content: %s", content)
	}

	orderIDStr := matches[1]
	orderID, err := strconv.ParseInt(orderIDStr, 10, 64)
	if err != nil {
		log.Error("SePay Webhook: Failed to parse order ID", "order_id_str", orderIDStr, "error", err)
		return "", fmt.Errorf("invalid order id: %s", orderIDStr)
	}

	log.Info("SePay Webhook: Parsed transaction", "order_id", orderID, "amount", amount)

	// Bắt đầu database transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	// 2. Query Bill bằng FOR UPDATE để tránh race condition
	var userID int
	var billAmount float64
	var paymentStatus string
	err = tx.QueryRowContext(ctx,
		"SELECT user_id, total_amount, payment_status FROM Bill WHERE bill_id = $1 FOR UPDATE",
		orderID,
	).Scan(&userID, &billAmount, &paymentStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Warn("SePay Webhook: Order not found", "order_id", orderID)
			return "", fmt.Errorf("order not found: %d", orderID)
		}
		return "", err
	}

	// Nếu đã PAID thì trả về thành công trực tiếp (idempotency)
	if paymentStatus == "PAID" {
		log.Info("SePay Webhook: Order already processed (PAID)", "order_id", orderID)
		return "already_processed", nil
	}

	// 3. Kiểm tra số tiền chuyển khoản
	// Do số tiền trong ví dụ là VNĐ nên ta so sánh chính xác phần số nguyên
	if math.Abs(billAmount-amount) >= 1.0 {
		return "", fmt.Errorf("sepay amount mismatch: expected %.2f, got %.2f", billAmount, amount)
	}

	// 4. Cập nhật trạng thái Bill thành PAID và paid_at = NOW()
	_, err = tx.ExecContext(ctx,
		"UPDATE Bill SET payment_status = 'PAID', paid_at = NOW() WHERE bill_id = $1",
		orderID,
	)
	if err != nil {
		log.Error("SePay Webhook: Failed to update bill to PAID", "order_id", orderID, "error", err)
		return "", err
	}

	// 5. Cập nhật các PENDING tickets của Bill này thành BOOKED kèm QR Code
	rows, err := tx.QueryContext(ctx,
		"SELECT ticket_id, event_id, category_ticket_id FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'",
		orderID,
	)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	type ticketMeta struct {
		ticketID         int
		eventID          int
		categoryTicketID int
	}
	var tickets []ticketMeta

	for rows.Next() {
		var t ticketMeta
		if err := rows.Scan(&t.ticketID, &t.eventID, &t.categoryTicketID); err != nil {
			return "", err
		}
		tickets = append(tickets, t)
	}

	if len(tickets) == 0 {
		log.Warn("SePay Webhook: No pending tickets found for bill", "bill_id", orderID)
	}

	bookedTicketIDs := []int{}
	var eventID int
	var categoryTicketID int

	for _, t := range tickets {
		eventID = t.eventID
		categoryTicketID = t.categoryTicketID

		// Tạo QR Code
		qrBase64, err := qrcode.GenerateTicketQRBase64(t.ticketID, 300)
		if err != nil {
			log.Error("SePay Webhook: Failed to generate QR code", "ticket_id", t.ticketID, "error", err)
			qrBase64 = fmt.Sprintf("SEPAY_QR_%d", t.ticketID)
		}

		// Update ticket
		_, err = tx.ExecContext(ctx,
			"UPDATE Ticket SET status = 'BOOKED', qr_code_value = $1 WHERE ticket_id = $2 AND status = 'PENDING'",
			qrBase64, t.ticketID,
		)
		if err != nil {
			log.Error("SePay Webhook: Failed to update ticket to BOOKED", "ticket_id", t.ticketID, "error", err)
			return "", err
		}
		bookedTicketIDs = append(bookedTicketIDs, t.ticketID)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return "", err
	}

	// 6. Gửi Email vé điện tử cho người dùng (async)
	if len(bookedTicketIDs) > 0 {
		realAmount := fmt.Sprintf("%.0f", billAmount)
		go r.sendMultipleTicketEmailsAsync(context.Background(), userID, eventID, bookedTicketIDs, realAmount, categoryTicketID, int(orderID))
		log.Info("SePay Webhook: Successfully processed payment and triggered email sending", "order_id", orderID, "tickets_count", len(bookedTicketIDs))
	} else {
		log.Info("SePay Webhook: Successfully processed payment but no tickets were updated", "order_id", orderID)
	}

	return "success", nil
}

// GetPaymentStatus - Lấy trạng thái thanh toán của Bill (SePay)
func (r *TicketRepository) GetPaymentStatus(ctx context.Context, orderID int64) (string, error) {
	var status string
	var createdAt time.Time
	var isExpired bool
	err := r.db.QueryRowContext(ctx,
		"SELECT payment_status, created_at, (NOW() > created_at + INTERVAL '5 minutes') FROM Bill WHERE bill_id = $1",
		orderID,
	).Scan(&status, &createdAt, &isExpired)
	if err != nil {
		if err == sql.ErrNoRows {
			return "NOT_FOUND", nil
		}
		return "", err
	}

	// Nếu trạng thái là PENDING và đã quá 5 phút từ lúc tạo đơn
	if status == "PENDING" && isExpired {
		log := logger.Default().WithContext(ctx)
		log.Info("⏳ SePay Order has expired (5m timeout). Canceling bill and updating tickets.", "bill_id", orderID, "created_at", createdAt)

		// Bắt đầu transaction để cancel Bill và Ticket liên quan
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return "", err
		}
		defer tx.Rollback()

		// 1. Cập nhật trạng thái Bill thành FAILED
		_, err = tx.ExecContext(ctx, "UPDATE Bill SET payment_status = 'FAILED' WHERE bill_id = $1 AND payment_status = 'PENDING'", orderID)
		if err != nil {
			return "", err
		}

		// 2. Xóa các vé đang ở trạng thái PENDING để giải phóng ghế lập tức và tránh Ghost Seat unique constraint
		_, err = tx.ExecContext(ctx, "DELETE FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'", orderID)
		if err != nil {
			tx.Rollback()
			return "", err
		}

		if err := tx.Commit(); err != nil {
			return "", err
		}

		// Trả về FAILED để thông báo cho client
		return "FAILED", nil
	}

	return status, nil
}

// CancelBankTransferOrder - Hủy đơn hàng và giải phóng vé lập tức
func (r *TicketRepository) CancelBankTransferOrder(ctx context.Context, orderID int64) error {
	log := logger.Default().WithContext(ctx)
	log.Info("Canceling order actively", "bill_id", orderID)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Fetch user ID associated with this bill to track behavior penalty
	var userID int
	_ = tx.QueryRowContext(ctx, "SELECT user_id FROM Bill WHERE bill_id = $1", orderID).Scan(&userID)

	// 1. Cập nhật Bill thành FAILED
	_, err = tx.ExecContext(ctx, "UPDATE Bill SET payment_status = 'FAILED' WHERE bill_id = $1 AND payment_status = 'PENDING'", orderID)
	if err != nil {
		return err
	}

	// 2. Xóa toàn bộ các bản ghi vé đang ở trạng thái PENDING thuộc đơn hàng này để giải phóng ghế lập tức
	_, err = tx.ExecContext(ctx, "DELETE FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'", orderID)
	if err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Strike Penalty Increment on active manual cancellation
	if userID > 0 {
		incrementUserPenalty(userID)
	}

	return nil
}

// AutoReleaseExpiredPendingBills - Tự động giải phóng các hóa đơn PENDING quá 5 phút
func (r *TicketRepository) AutoReleaseExpiredPendingBills(ctx context.Context) {
	log := logger.Default().WithContext(ctx)

	// Dọn sạch các vé trạng thái EXPIRED để giải phóng hoàn toàn các "ghế ma" lịch sử
	if _, err := r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE status = 'EXPIRED'"); err != nil {
		log.Warn("AutoReleaseExpiredPendingBills - failed to purge legacy EXPIRED tickets: %v", err)
	}

	// 1. Tìm các Bill có trạng thái PENDING quá 5 phút kèm user_id để phạt
	query := `
		SELECT bill_id, user_id 
		FROM Bill 
		WHERE payment_status = 'PENDING' 
		  AND created_at < NOW() - INTERVAL '5 minutes'
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		log.Error("AutoReleaseExpiredPendingBills - failed to query expired bills: %v", err)
		return
	}
	defer rows.Close()

	type expiredBill struct {
		billID int64
		userID int
	}
	var expiredBills []expiredBill
	for rows.Next() {
		var billID int64
		var userID int
		if err := rows.Scan(&billID, &userID); err == nil {
			expiredBills = append(expiredBills, expiredBill{billID: billID, userID: userID})
		}
	}

	if len(expiredBills) == 0 {
		return
	}

	log.Info("AutoReleaseExpiredPendingBills - found %d expired bills", len(expiredBills))

	// Giải phóng từng hóa đơn
	for _, item := range expiredBills {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			log.Error("AutoReleaseExpiredPendingBills - failed to start tx for bill %d: %v", item.billID, err)
			continue
		}

		// Update Bill status to FAILED
		_, err = tx.ExecContext(ctx, "UPDATE Bill SET payment_status = 'FAILED' WHERE bill_id = $1 AND payment_status = 'PENDING'", item.billID)
		if err != nil {
			tx.Rollback()
			log.Error("AutoReleaseExpiredPendingBills - failed to update bill %d: %v", item.billID, err)
			continue
		}

		// Delete pending tickets linked to this bill to release seats immediately
		_, err = tx.ExecContext(ctx, "DELETE FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'", item.billID)
		if err != nil {
			tx.Rollback()
			log.Error("AutoReleaseExpiredPendingBills - failed to delete tickets for bill %d: %v", item.billID, err)
			continue
		}

		if err := tx.Commit(); err != nil {
			log.Error("AutoReleaseExpiredPendingBills - failed to commit tx for bill %d: %v", item.billID, err)
		} else {
			log.Info("AutoReleaseExpiredPendingBills - successfully released bill %d", item.billID)
			// Increment penalty count on successful expiration cleanup
			incrementUserPenalty(item.userID)
		}
	}
}

// sendTicketEmailAsync gửi email vé điện tử trong goroutine (không block payment response)
// KHỚP VỚI Java BuyTicketController gọi EmailUtils.sendEmail()
func (r *TicketRepository) sendTicketEmailAsync(ctx context.Context, userID, eventID, seatID, ticketID int, amount string, categoryTicketID int) {
	// ⭐ FIX: dùng background context để tránh lỗi "context canceled" sau khi HTTP redirect
	bgCtx := context.Background()
	log := logger.Default().WithContext(bgCtx)
	log.Info("🔔 STARTING sendTicketEmailAsync", "user_id", userID, "ticket_id", ticketID)

	// Lấy thông tin user
	var userEmail, userName string
	err := r.db.QueryRowContext(bgCtx,
		"SELECT email, full_name FROM Users WHERE user_id = $1",
		userID,
	).Scan(&userEmail, &userName)
	if err != nil {
		log.Error("Failed to get user for email", "user_id", userID, "error", err)
		return
	}
	if userEmail == "" {
		log.Warn("User has no email", "user_id", userID)
		return
	}

	// Lấy QR Base64 từ database (ĐÃ LƯU SAU PAYMENT CALLBACK)
	var qrBase64 string
	err = r.db.QueryRowContext(bgCtx,
		"SELECT qr_code_value FROM Ticket WHERE ticket_id = $1",
		ticketID,
	).Scan(&qrBase64)
	if err != nil {
		log.Error("Failed to get QR code from database", "ticket_id", ticketID, "error", err)
		qrBase64 = "" // Gửi email không có QR nếu lỗi
	}

	// Lấy thông tin event + venue (KHỚP VỚI GetEventByID logic)
	var eventTitle string
	var startTime time.Time
	var areaID sql.NullInt64
	var areaName sql.NullString
	var venueName sql.NullString
	var venueLocation sql.NullString
	err = r.db.QueryRowContext(bgCtx,
		`SELECT e.title, e.start_time, e.area_id, 
		        COALESCE(va.area_name, 'Chưa xác định') as area_name,
		        COALESCE(v.venue_name, 'Chưa xác định') as venue_name,
		        COALESCE(v.location, 'Chưa xác định') as location
		 FROM Event e
		 LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		 LEFT JOIN Venue v ON va.venue_id = v.venue_id
		 WHERE e.event_id = $1`,
		eventID,
	).Scan(&eventTitle, &startTime, &areaID, &areaName, &venueName, &venueLocation)
	if err != nil {
		log.Error("Failed to get event for email", "event_id", eventID, "error", err)
		return
	}

	// Lấy thông tin ghế
	var seatCode string
	r.db.QueryRowContext(bgCtx,
		"SELECT seat_code FROM Seat WHERE seat_id = $1",
		seatID,
	).Scan(&seatCode)

	// Lấy thông tin loại vé
	var categoryName string
	r.db.QueryRowContext(bgCtx,
		"SELECT name FROM Category_Ticket WHERE category_ticket_id = $1",
		categoryTicketID,
	).Scan(&categoryName)

	// Lấy thông tin venue + area (KHỚP VỚI JAVA)
	// Venue_Area + Venue join đã cho chúng ta venue_name và location
	finalVenueName := "Chưa xác định"
	finalVenueAddress := "Chưa xác định"
	finalAreaName := "Chưa xác định"

	if areaName.Valid && areaName.String != "" && areaName.String != "Chưa xác định" {
		finalAreaName = areaName.String
	}

	if venueName.Valid && venueName.String != "" && venueName.String != "Chưa xác định" {
		finalVenueName = venueName.String
	}

	if venueLocation.Valid && venueLocation.String != "" && venueLocation.String != "Chưa xác định" {
		finalVenueAddress = venueLocation.String
	}

	// Format giá tiền giống Java: 250.000 đ (dấu chấm phân cách hàng nghìn)
	formattedAmount := formatCurrency(amount)

	// Tạo Map URL với encoding đúng
	mapURL := "https://www.google.com/maps"
	if finalVenueAddress != "Chưa xác định" && finalVenueAddress != "" {
		// Chỉ dùng địa chỉ nếu có thực
		mapURL = fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(finalVenueAddress))
	} else if finalVenueName != "Chưa xác định" && finalVenueName != "" {
		// Fallback: dùng tên venue nếu không có địa chỉ
		mapURL = fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(finalVenueName))
	}

	// Parse seat code để lấy row và number (format: "A5" -> row="A", number="5")
	seatRow := ""
	seatNumber := ""
	if len(seatCode) > 0 {
		// Tách chữ cái đầu và số phía sau (vd: "A5" -> "A", "5")
		for i, c := range seatCode {
			if c >= '0' && c <= '9' {
				seatRow = seatCode[:i]
				seatNumber = seatCode[i:]
				break
			}
		}
		// Fallback nếu không parse được
		if seatRow == "" {
			seatRow = seatCode
			seatNumber = "1"
		}
	}

	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		log.Warn("Notification API is disabled; skip sending direct email from ticket-service", "ticket_id", ticketID)
		return
	}

	if err := sendSingleTicketViaNotifyAPI(bgCtx, map[string]interface{}{
		"ticket_id":      ticketID,
		"user_email":     userEmail,
		"user_name":      userName,
		"event_title":    eventTitle,
		"start_time":     utils.FormatTimeToWallClockRFC3339(startTime),
		"venue_name":     finalVenueName,
		"area_name":      finalAreaName,
		"venue_address":  finalVenueAddress,
		"seat_code":      seatCode,
		"seat_row":       seatRow,
		"seat_number":    seatNumber,
		"category_name":  categoryName,
		"price":          formattedAmount,
		"qr_base64":      qrBase64,
		"map_url":        mapURL,
		"payment_method": "VNPAY",
	}); err != nil {
		log.Error("Notification API failed for single ticket email dispatch", "ticket_id", ticketID, "error", err)
		return
	}

	log.Info("Ticket email dispatch request sent to Notification API", "ticket_id", ticketID)
}

// sendMultipleTicketEmailsAsync gửi 1 email với NHIỀU PDF attachments (mỗi vé 1 PDF)
// Được gọi khi user mua nhiều ghế cùng lúc (max 4 ghế)
func (r *TicketRepository) sendMultipleTicketEmailsAsync(ctx context.Context, userID, eventID int, ticketIDs []int, totalAmount string, categoryTicketID, billID int) {
	// ⭐ FIX: luôn dùng background context để tránh lỗi "context canceled" sau khi HTTP redirect
	bgCtx := context.Background()
	log := logger.Default().WithContext(bgCtx)
	log.Info("🔔 STARTING sendMultipleTicketEmailsAsync", "user_id", userID, "ticket_count", len(ticketIDs))

	// Lấy thông tin user
	var userEmail, userName string
	err := r.db.QueryRowContext(bgCtx,
		"SELECT email, full_name FROM Users WHERE user_id = $1",
		userID,
	).Scan(&userEmail, &userName)
	if err != nil {
		log.Error("Failed to get user for email", "user_id", userID, "error", err)
		return
	}
	if userEmail == "" {
		log.Warn("User has no email", "user_id", userID)
		return
	}
	fmt.Printf("[NOTIFY] 📧 Chuẩn bị gửi vé tới email: %s (userID=%d)\n", userEmail, userID)

	// Lấy thông tin event + venue (chung cho tất cả vé)
	var eventTitle string
	var startTime time.Time
	var endTime time.Time
	var areaID sql.NullInt64
	var areaName sql.NullString
	var venueName sql.NullString
	var venueLocation sql.NullString
	var createdBy sql.NullInt64
	err = r.db.QueryRowContext(bgCtx,
		`SELECT e.title, e.start_time, e.end_time, e.area_id, e.created_by,
		        COALESCE(va.area_name, 'Chưa xác định') as area_name,
		        COALESCE(v.venue_name, 'Chưa xác định') as venue_name,
		        COALESCE(v.location, 'Chưa xác định') as location
		 FROM Event e
		 LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		 LEFT JOIN Venue v ON va.venue_id = v.venue_id
		 WHERE e.event_id = $1`,
		eventID,
	).Scan(&eventTitle, &startTime, &endTime, &areaID, &createdBy, &areaName, &venueName, &venueLocation)
	if err != nil {
		log.Error("Failed to get event for email", "event_id", eventID, "error", err)
		return
	}

	finalVenueName := "Chưa xác định"
	finalVenueAddress := "Chưa xác định"
	finalAreaName := "Chưa xác định"

	if areaName.Valid && areaName.String != "" && areaName.String != "Chưa xác định" {
		finalAreaName = areaName.String
	}
	if venueName.Valid && venueName.String != "" && venueName.String != "Chưa xác định" {
		finalVenueName = venueName.String
	}
	if venueLocation.Valid && venueLocation.String != "" && venueLocation.String != "Chưa xác định" {
		finalVenueAddress = venueLocation.String
	}

	// Lấy thông tin organizer từ created_by
	var organizerName string = "Event Organizer"
	var organizerEmail string = ""
	if createdBy.Valid && createdBy.Int64 > 0 {
		r.db.QueryRowContext(bgCtx,
			"SELECT COALESCE(full_name, 'Event Organizer'), COALESCE(email, '') FROM Users WHERE user_id = $1",
			createdBy.Int64,
		).Scan(&organizerName, &organizerEmail)
	}

	// Tạo Map URL
	mapURL := "https://www.google.com/maps"
	if finalVenueAddress != "Chưa xác định" && finalVenueAddress != "" {
		mapURL = fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(finalVenueAddress))
	} else if finalVenueName != "Chưa xác định" && finalVenueName != "" {
		mapURL = fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(finalVenueName))
	}

	if !config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		log.Warn("Notification API is disabled; skip sending direct email from ticket-service", "ticket_count", len(ticketIDs))
		return
	}

	items := []map[string]interface{}{}
	for _, ticketID := range ticketIDs {
		var qrBase64 string
		var seatCode string
		var ticketCategoryName string
		var price float64
		err = r.db.QueryRowContext(bgCtx,
			`SELECT t.qr_code_value, s.seat_code, COALESCE(ct.name, 'Vé'), COALESCE(ct.price, 0)
			 FROM Ticket t
			 JOIN Seat s ON t.seat_id = s.seat_id
			 LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			 WHERE t.ticket_id = $1`,
			ticketID,
		).Scan(&qrBase64, &seatCode, &ticketCategoryName, &price)
		if err != nil {
			log.Error("Failed to get ticket for notify API", "ticket_id", ticketID, "error", err)
			continue
		}
		seatRow, seatNumber := parseSeatCodeHelper(seatCode)
		items = append(items, map[string]interface{}{
			"ticket_id":     ticketID,
			"qr_base64":     qrBase64,
			"seat_code":     seatCode,
			"seat_row":      seatRow,
			"seat_number":   seatNumber,
			"category_name": ticketCategoryName,
			"price":         formatCurrency(fmt.Sprintf("%.0f", price)),
		})
	}

	if len(items) == 0 {
		log.Error("Skip dispatch because no valid ticket payload for Notification API", "ticket_count", len(ticketIDs))
		return
	}

	if err := sendMultipleTicketsViaNotifyAPI(bgCtx, map[string]interface{}{
		"user_email":      userEmail,
		"user_name":       userName,
		"event_title":     eventTitle,
		"start_time":      utils.FormatTimeToWallClockRFC3339(startTime),
		"end_time":        utils.FormatTimeToWallClockRFC3339(endTime),
		"venue_name":      finalVenueName,
		"area_name":       finalAreaName,
		"venue_address":   finalVenueAddress,
		"total_amount":    formatCurrency(totalAmount),
		"map_url":         mapURL,
		"organizer_name":  organizerName,
		"organizer_email": organizerEmail,
		"items":           items,
	}); err != nil {
		log.Error("Notification API failed for multiple ticket email dispatch", "ticket_count", len(ticketIDs), "error", err)
		return
	}

	log.Info("Multiple ticket email dispatch request sent to Notification API", "ticket_count", len(ticketIDs))
}

// formatCurrency formats amount string to Vietnamese currency format
// Example: "25000000" -> "250.000 đ"
// KHỚP VỚI Java BuyTicketController.formatCurrency()
func formatCurrency(amountStr string) string {
	// Parse string to number
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return amountStr + " VND"
	}

	// Format with dot as thousand separator (Vietnamese style)
	intPart := int64(amount)
	result := fmt.Sprintf("%d", intPart)

	// Add dots every 3 digits from right
	var formatted strings.Builder
	for i, c := range result {
		if i > 0 && (len(result)-i)%3 == 0 {
			formatted.WriteRune('.')
		}
		formatted.WriteRune(c)
	}

	return formatted.String() + " đ"
}

// ============================================================
// WALLET PAYMENT METHODS
// ============================================================

// GetUserWalletBalance - Lấy số dư ví của user từ bảng Wallet (single source of truth)
// Auth Service quản lý Users.Wallet column via API
func (r *TicketRepository) GetUserWalletBalance(ctx context.Context, userID int) (float64, error) {
	fmt.Printf("[WALLET_DB] 🔍 Fetching balance for userID: %d\n", userID)

	var balance float64
	query := `SELECT COALESCE(balance, 0) FROM Wallet WHERE user_id = $1`

	fmt.Printf("[WALLET_DB] 📝 Executing query: %s with userID=%d\n", query, userID)

	err := r.db.QueryRowContext(ctx, query, userID).Scan(&balance)
	if err != nil {
		if err == sql.ErrNoRows {
			// No wallet record → return 0 balance
			fmt.Printf("[WALLET_DB] ⚠️  No wallet record for user %d, returning 0\n", userID)
			return 0, nil
		}
		fmt.Printf("[WALLET_DB] ❌ Database query error: %v\n", err)
		return 0, fmt.Errorf("error getting wallet balance for user %d: %w", userID, err)
	}

	fmt.Printf("[WALLET_FINAL_CHECK] User %d has Wallet: %f\n", userID, balance)
	fmt.Printf("[WALLET_DB] ✅ User %d has balance: %.2f VND in database\n", userID, balance)
	return balance, nil
}

// CalculateSeatsTotal - Tính tổng giá cho các ghế
// KHỚP VỚI Java: SeatService.calculateSeatsPrice()
func (r *TicketRepository) CalculateSeatsTotal(ctx context.Context, eventID int, seatIDs []int) (int, error) {
	if len(seatIDs) == 0 {
		return 0, fmt.Errorf("no seats provided")
	}

	// Log for debugging
	fmt.Printf("[SQL_FIX] Đang truy vấn bảng Seat cho seatIDs: %v\n", seatIDs)
	fmt.Printf("[SQL_FIX] EventID: %d, SeatIDs count: %d\n", eventID, len(seatIDs))

	// Build placeholder string for IN clause
	placeholders := make([]string, len(seatIDs))
	args := make([]interface{}, len(seatIDs)+1)
	args[0] = eventID

	for i, seatID := range seatIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args[i+1] = seatID
	}

	query := fmt.Sprintf(`
		SELECT COALESCE(SUM(ct.price), 0) as total
		FROM Seat s
		JOIN Category_Ticket ct ON s.category_ticket_id = ct.category_ticket_id
		WHERE ct.event_id = $1 AND s.seat_id IN (%s)
	`, strings.Join(placeholders, ","))

	fmt.Printf("[SQL_FIX] Query: %s\n", query)
	fmt.Printf("[SQL_FIX] Args: %v\n", args)
	fmt.Printf("[SQL_FIX_SUCCESS] Đã đổi alias sang ct.event_id cho EventID: %d\n", eventID)

	var total float64
	err := r.db.QueryRowContext(ctx, query, args...).Scan(&total)
	if err != nil {
		fmt.Printf("[SQL_FIX] ❌ Error calculating seats total: %v\n", err)
		return 0, fmt.Errorf("error calculating seats total: %w", err)
	}

	fmt.Printf("[DATATYPE_FIX] Scan thành công total: %f\n", total)
	fmt.Printf("[SQL_FIX] ✅ Total amount calculated: %.2f VND\n", total)

	// Convert to int for return (prices are in VND without decimals)
	return int(total), nil
}

// ProcessWalletPayment - Xử lý thanh toán bằng ví
// Tạo vé, cập nhật số dư ví, gửi email
// KHỚP VỚI Java: BuyTicketService.buyTicketByWallet()
//
// ATOMIC TRANSACTION with SELECT FOR UPDATE:
// 1. Lock user's balance row to prevent concurrent updates
// 2. Check if balance is sufficient
// 3. Create tickets
// 4. Deduct balance atomically
// 5. Commit (releases lock)
// 6. Send email notifications
func (r *TicketRepository) ProcessWalletPayment(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, amount int) (string, error) {
	// Auto release expired bills first (Lazy Expiry Evaluation)
	r.AutoReleaseExpiredPendingBills(ctx)

	// Rule 2 check: Check if user is locked out due to seat hoarding
	penaltyMutex.RLock()
	penalty, exists := userPenalties[userID]
	if exists && !penalty.LockedUntil.IsZero() && time.Now().Before(penalty.LockedUntil) {
		remainingSeconds := int(penalty.LockedUntil.Sub(time.Now()).Seconds())
		penaltyMutex.RUnlock()
		return "", apperrors.BusinessError(fmt.Sprintf("[E4003]|%d", remainingSeconds))
	}
	penaltyMutex.RUnlock()

	// Rule 1 check: Limiting user to max 1 active PENDING bill with Smart Resume Flow
	var pendingBillID int64
	var createdAt time.Time
	pendingErr := r.db.QueryRowContext(ctx, "SELECT bill_id, created_at FROM Bill WHERE user_id = $1 AND payment_status = 'PENDING'", userID).Scan(&pendingBillID, &createdAt)
	if pendingErr == nil {
		remainingSeconds := 300 - int(time.Now().Sub(createdAt).Seconds())
		if remainingSeconds < 0 {
			remainingSeconds = 0
		}

		rows, seatErr := r.db.QueryContext(ctx, `
			SELECT t.event_id, t.category_ticket_id, t.seat_id, s.seat_code 
			FROM Ticket t
			JOIN Seat s ON t.seat_id = s.seat_id
			WHERE t.bill_id = $1 AND t.status = 'PENDING'
		`, pendingBillID)

		var evID int
		var catID int
		var seatIDsList []string
		var seatCodes []string
		var pendingSeatIDs []int

		if seatErr == nil {
			defer rows.Close()
			for rows.Next() {
				var eID, cID, seatID int
				var code string
				if scanErr := rows.Scan(&eID, &cID, &seatID, &code); scanErr == nil {
					evID = eID
					catID = cID
					seatIDsList = append(seatIDsList, strconv.Itoa(seatID))
					seatCodes = append(seatCodes, code)
					pendingSeatIDs = append(pendingSeatIDs, seatID)
				}
			}
		}

		// Check if request seatIDs match the pending bill's seatIDs exactly
		if equalIntSlices(pendingSeatIDs, seatIDs) {
			return r.ProcessWalletPaymentForExistingBill(ctx, userID, pendingBillID, amount)
		}

		seatsStr := strings.Join(seatCodes, ",")
		seatIDsStr := strings.Join(seatIDsList, ",")

		return "", apperrors.BusinessError(fmt.Sprintf("[E4002]|%d|%s|%s|%d|%d|%d", pendingBillID, seatsStr, seatIDsStr, evID, catID, remainingSeconds))
	}

	// ===== VALIDATION: CHECK EVENT STATUS BEFORE TRANSACTION =====
	// Prevent booking on closed/cancelled events
	var eventStatus string
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, "SELECT status, start_time FROM Event WHERE event_id = $1", eventID).Scan(&eventStatus, &startTime)
	if err != nil {
		return "", fmt.Errorf("event not found")
	}

	// Event phải ở trạng thái OPEN để có thể mua vé
	if eventStatus != "OPEN" {
		fmt.Printf("[SECURITY] Cảnh báo: User %d cố tình đặt vé cho sự kiện CLOSED (ID: %d), status=%s\n", userID, eventID, eventStatus)
		return "", fmt.Errorf("Sự kiện đã kết thúc hoặc đã đóng, không thể đặt thêm ghế")
	}

	// ⭐ SECURITY: Kiểm tra xem event đã bắt đầu chưa
	// Sử dụng giờ thực để so sánh xem sự kiên đã bắt đầu/kết thúc hay chưa - chống hacker bypass
	now := time.Now()
	// start_time từ DB đang lưu ở múi giờ UTC, ta đang so sánh với UTC (time.Now() ở backend server)
	if now.After(startTime) || now.Equal(startTime) {
		fmt.Printf("[BOOKING_SECURITY] User %d blocked from buying ticket for Event %d (Event started at %s)\n", userID, eventID, startTime.Format(time.RFC3339))
		return "", fmt.Errorf("Sự kiện đã bắt đầu hoặc kết thúc, không thể đặt thêm vé")
	}

	// Start transaction with appropriate isolation level
	opts := &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead, // Prevents dirty reads and non-repeatable reads
		ReadOnly:  false,
	}
	tx, err := r.db.BeginTx(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	// ===== STEP 1: LOCK AND CHECK WALLET BALANCE =====
	// Use Wallet table as the single source of truth (microservice isolation)
	// Lock the Wallet row with FOR UPDATE to prevent concurrent modifications

	fmt.Printf("[DEBUG] ProcessWalletPayment: Locking wallet balance for userID=%d\n", userID)

	var currentBalance float64
	var walletID int
	lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
	err = tx.QueryRowContext(ctx, lockQuery, userID).Scan(&walletID, &currentBalance)
	if err != nil {
		if err == sql.ErrNoRows {
			// Auto-create wallet with balance 0 (Auth Service manages Users.Wallet via API)
			var walletID64 int64
			insertErr := tx.QueryRowContext(ctx,
				"INSERT INTO Wallet (user_id, balance, currency, status) VALUES ($1, 0, 'VND', 'ACTIVE') RETURNING wallet_id", userID).Scan(&walletID64)
			if insertErr != nil {
				return "", fmt.Errorf("error creating wallet: %w", insertErr)
			}
			walletID = int(walletID64)
			currentBalance = 0
			fmt.Printf("[WALLET_MIGRATE] ✅ Created Wallet for user=%d, balance=0\n", userID)
		} else {
			return "", fmt.Errorf("error locking wallet balance: %w", err)
		}
	}

	fmt.Printf("[WALLET_FINAL_CHECK] User %d has Wallet: %f\n", userID, currentBalance)
	fmt.Printf("[PAYMENT_CHECK] UserID: %d, Balance: %.2f, Amount: %d (%.2f VND)\n", userID, currentBalance, amount, float64(amount))
	fmt.Printf("[DEBUG] ProcessWalletPayment: Current balance=%.2f, Required amount=%d\n", currentBalance, amount)

	// Check if sufficient balance
	if currentBalance < float64(amount) {
		insufficientAmount := float64(amount) - currentBalance
		fmt.Printf("[PAYMENT_CHECK] ❌ INSUFFICIENT BALANCE - UserID: %d, Balance: %.2f, Required: %d, Shortage: %.2f\n", userID, currentBalance, amount, insufficientAmount)
		fmt.Printf("[DEBUG] ProcessWalletPayment: INSUFFICIENT BALANCE - need %.2f more, current %.2f\n", insufficientAmount, currentBalance)
		return "", fmt.Errorf("insufficient_balance|%d|%.0f", int(insufficientAmount), currentBalance)
	}

	fmt.Printf("[PAYMENT_CHECK] ✅ SUFFICIENT BALANCE - UserID: %d, Balance: %.2f, Required: %d, Remaining after: %.2f\n", userID, currentBalance, amount, currentBalance-float64(amount))

	// ===== STEP 2: CREATE TICKETS =====
	// Collect ticket info for email and PDF generation
	ticketIds := []string{}
	ticketTypes := []string{}
	seatCodes := []string{}
	qrValues := []string{} // Store QR values for PDF generation
	categoryNames := []string{}
	prices := []float64{}
	areaNames := []string{}
	var eventTitle, venueName, venueAddress, userEmail, userName, seatCode string
	var totalPrice float64
	var endTime time.Time
	var createdBy sql.NullInt64

	for _, seatID := range seatIDs {
		fmt.Printf("[SQL_FIX] Creating ticket for seatID: %d, userID: %d, eventID: %d\n", seatID, userID, eventID)

		// Resolve ticket category from seat to preserve mixed-category purchases.
		currentCategoryTicketID := categoryTicketID
		err = tx.QueryRowContext(ctx, `
			SELECT s.category_ticket_id
			FROM Seat s
			JOIN Category_Ticket ct ON s.category_ticket_id = ct.category_ticket_id
			WHERE s.seat_id = $1 AND ct.event_id = $2
		`, seatID, eventID).Scan(&currentCategoryTicketID)
		if err != nil {
			return "", fmt.Errorf("error resolving category for seat %d: %w", seatID, err)
		}

		// Create ticket in database with PENDING_QR (will update after getting ticketID)
		insertTicketQuery := `
			INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at)
			VALUES ($1, $2, $3, $4, 'PENDING_QR', 'BOOKED', NOW())
			RETURNING ticket_id
		`

		var ticketID int64
		err = tx.QueryRowContext(ctx, insertTicketQuery, userID, eventID, currentCategoryTicketID, seatID).Scan(&ticketID)
		if err != nil {
			fmt.Printf("[SQL_FIX] ❌ Error creating ticket: %v\n", err)
			if strings.Contains(err.Error(), "unique constraint") || strings.Contains(err.Error(), "ticket_event_id_seat_id_key") {
				return "", apperrors.BusinessError("Ghế đặt hiện đang nằm trong trạng thái xử lý thanh toán. Vui lòng thử lại sau ít phút hoặc chọn ghế khác!")
			}
			return "", fmt.Errorf("error creating ticket: %w", err)
		}

		// Generate QR code Base64 from ticketID (same as VNPAY)
		qrBase64, err := qrcode.GenerateTicketQRBase64(int(ticketID), 300)
		if err != nil {
			fmt.Printf("[QR_FIX] ⚠️ Failed to generate QR for Ticket ID: %d, error: %v\n", ticketID, err)
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
		}

		// Update ticket with real QR code
		updateQRQuery := `UPDATE Ticket SET qr_code_value = $1 WHERE ticket_id = $2`
		_, err = tx.ExecContext(ctx, updateQRQuery, qrBase64, ticketID)
		if err != nil {
			fmt.Printf("[QR_FIX] ❌ Failed to update QR for Ticket ID: %d\n", ticketID)
			return "", fmt.Errorf("error updating QR code: %w", err)
		}

		// Security: Don't log token or QR code - only log ticket ID
		fmt.Printf("[QR_FIX] ✅ QR code generated for Ticket ID: %d\n", ticketID)

		ticketIds = append(ticketIds, fmt.Sprintf("%d", ticketID))
		qrValues = append(qrValues, qrBase64) // Store QR Base64 for later PDF generation

		// Get ticket and event details for email
		selectTicketQuery := `
			SELECT 
				e.title,
				e.start_time,
				e.end_time,
				e.created_by,
				v.location,
				v.venue_name,
				va.area_name,
				s.seat_code,
				ct.name as category_name,
				ct.price,
				u.email,
				u.full_name
			FROM Ticket t
			JOIN Event e ON t.event_id = e.event_id
			JOIN Venue_Area va ON e.area_id = va.area_id
			JOIN Venue v ON va.venue_id = v.venue_id
			JOIN Seat s ON t.seat_id = s.seat_id
			JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			JOIN users u ON t.user_id = u.user_id
			WHERE t.ticket_id = $1
		`

		fmt.Printf("[SQL_FIX] Querying ticket details for ticketID: %d\n", ticketID)
		fmt.Printf("[FINAL_FIX] Đã thay e.address bằng v.location. Chuẩn bị hoàn tất thanh toán cho User: %d\n", userID)

		var categoryName, areaName string
		var price float64
		var endTime time.Time
		var createdBy sql.NullInt64
		err = tx.QueryRowContext(ctx, selectTicketQuery, ticketID).Scan(
			&eventTitle,
			&startTime,
			&endTime,
			&createdBy,
			&venueAddress,
			&venueName,
			&areaName,
			&seatCode,
			&categoryName,
			&price,
			&userEmail,
			&userName,
		)
		if err != nil {
			return "", fmt.Errorf("error getting ticket details: %w", err)
		}

		ticketTypes = append(ticketTypes, categoryName)
		seatCodes = append(seatCodes, seatCode)
		categoryNames = append(categoryNames, categoryName)
		prices = append(prices, price)
		areaNames = append(areaNames, areaName)
		totalPrice += price
	}

	// Get organizer name and email from created_by
	var organizerName string = "Event Organizer"
	var organizerEmail string = ""
	if createdBy.Valid && createdBy.Int64 > 0 {
		err := r.db.QueryRowContext(ctx,
			"SELECT COALESCE(full_name, 'Event Organizer'), COALESCE(email, '') FROM Users WHERE user_id = $1",
			createdBy.Int64,
		).Scan(&organizerName, &organizerEmail)
		if err != nil {
			fmt.Printf("[ORGANIZER] Failed to get organizer info: %v, using defaults\n", err)
			organizerName = "Event Organizer"
			organizerEmail = ""
		}
	}
	// All wallet writes go through Wallet table only. Auth Service manages Users.Wallet via API.
	newBalance := currentBalance - float64(amount)
	updateWalletQuery := `UPDATE Wallet SET balance = $1 WHERE wallet_id = $2 AND balance >= $3`
	result, err := tx.ExecContext(ctx, updateWalletQuery, newBalance, walletID, float64(amount))
	if err != nil {
		return "", fmt.Errorf("error updating wallet: %w", err)
	}

	// Verify the update was applied
	rowsAffected, err := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		fmt.Printf("[PAYMENT_CHECK] ❌ WALLET UPDATE FAILED - UserID: %d, Amount: %d, RowsAffected: %d\n", userID, amount, rowsAffected)
		return "", fmt.Errorf("Số dư ví không đủ để hoàn tất giao dịch")
	}

	fmt.Printf("[PAYMENT_CHECK] ✅ WALLET DEDUCTED - UserID: %d, Amount: %d, New Balance: %.2f\n", userID, amount, newBalance)
	fmt.Printf("[DEBUG] ProcessWalletPayment: Successfully deducted %d from userID=%d\n", amount, userID)

	refID := fmt.Sprintf("tickets:%s", strings.Join(ticketIds, ","))
	if amount == 0 {
		refID = generateDeterministicUUID(userID, eventID, seatIDs)
	}

	// Log transaction in Wallet_Transaction table
	_, txErr := tx.ExecContext(ctx,
		`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES ($1, $2, 'DEBIT', $3, $4, $5, 'TICKET_PURCHASE', $6, $7)`,
		walletID, userID, float64(amount), currentBalance, newBalance,
		refID,
		fmt.Sprintf("Mua vé event %d", eventID),
	)
	if txErr != nil {
		fmt.Printf("[WALLET_TX] ⚠️ Failed to log Wallet_Transaction: %v\n", txErr)
		return "", fmt.Errorf("giao dịch ví thất bại: %w", txErr)
	}

	// ===== STEP 3.5: CREATE BILL =====
	// Create bill record for this wallet payment within the same transaction
	// ⭐ CRITICAL FIX: If amount == 0, MUST set payment_method to 'FREE' regardless of student choice
	paymentMethodForBill := "Wallet"
	if amount == 0 {
		paymentMethodForBill = "FREE"
	}

	var billID int64
	err = tx.QueryRowContext(ctx,
		"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES ($1, $2, 'VND', $3, 'PAID', NOW(), NOW()) RETURNING bill_id",
		userID, float64(amount), paymentMethodForBill,
	).Scan(&billID)
	if err != nil {
		return "", fmt.Errorf("error creating bill: %w", err)
	}

	fmt.Printf("[BILL_CREATED] ✅ Da xuat hoa don ID: %d cho phuong thuc: %s\n", billID, paymentMethodForBill)

	// ===== STEP 4: COMMIT TRANSACTION =====
	// This releases the lock and makes changes permanent
	if err = tx.Commit(); err != nil {
		return "", fmt.Errorf("error committing transaction: %w", err)
	}

	fmt.Printf("[DEBUG] ProcessWalletPayment: Transaction committed for userID=%d\n", userID)

	// ===== STEP 4.5: SEND TICKET NOTIFICATION =====
	// Phase 6: Dual path - Notification API or local PDF+email
	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) && len(ticketIds) > 0 {
		notifyCtx := context.Background()
		if len(ticketIds) == 1 {
			ticketID, _ := strconv.Atoi(ticketIds[0])
			seatRow, seatNumber := parseSeatCodeHelper(seatCodes[0])
			if err := sendSingleTicketViaNotifyAPI(notifyCtx, map[string]interface{}{
				"ticket_id":       ticketID,
				"user_email":      userEmail,
				"user_name":       userName,
				"event_title":     eventTitle,
				"start_time":      utils.FormatTimeToWallClockRFC3339(startTime),
				"end_time":        utils.FormatTimeToWallClockRFC3339(endTime),
				"venue_name":      venueName,
				"area_name":       areaNames[0],
				"venue_address":   venueAddress,
				"seat_code":       seatCodes[0],
				"seat_row":        seatRow,
				"seat_number":     seatNumber,
				"category_name":   categoryNames[0],
				"price":           formatCurrency(fmt.Sprintf("%.0f", prices[0])),
				"qr_base64":       qrValues[0],
				"map_url":         fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(venueAddress)),
				"payment_method":  "wallet",
				"organizer_name":  organizerName,
				"organizer_email": organizerEmail,
			}); err != nil {
				fmt.Printf("[WARN] Notification API failed for single ticket dispatch: %v\n", err)
			} else {
				fmt.Printf("[NOTIFY_API] ✅ Single ticket email sent via Notification API\n")
				fmt.Printf("[DEBUG] ProcessWalletPayment: COMPLETED for userID=%d with %d tickets\n", userID, len(ticketIds))
				return strings.Join(ticketIds, ","), nil
			}
		} else {
			items := []map[string]interface{}{}
			for i, ticketIDStr := range ticketIds {
				ticketID, _ := strconv.Atoi(ticketIDStr)
				seatRow, seatNumber := parseSeatCodeHelper(seatCodes[i])
				items = append(items, map[string]interface{}{
					"ticket_id":     ticketID,
					"qr_base64":     qrValues[i],
					"seat_code":     seatCodes[i],
					"seat_row":      seatRow,
					"seat_number":   seatNumber,
					"category_name": categoryNames[i],
					"price":         formatCurrency(fmt.Sprintf("%.0f", prices[i])),
				})
			}
			if err := sendMultipleTicketsViaNotifyAPI(notifyCtx, map[string]interface{}{
				"user_email":      userEmail,
				"user_name":       userName,
				"event_title":     eventTitle,
				"start_time":      utils.FormatTimeToWallClockRFC3339(startTime),
				"end_time":        utils.FormatTimeToWallClockRFC3339(endTime),
				"venue_name":      venueName,
				"area_name":       areaNames[0],
				"venue_address":   venueAddress,
				"total_amount":    fmt.Sprintf("%.0f", totalPrice),
				"map_url":         fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(venueAddress)),
				"organizer_name":  organizerName,
				"organizer_email": organizerEmail,
				"items":           items,
			}); err != nil {
				fmt.Printf("[WARN] Notification API failed for multiple ticket dispatch: %v\n", err)
			} else {
				fmt.Printf("[NOTIFY_API] ✅ Multiple tickets email sent via Notification API\n")
				fmt.Printf("[DEBUG] ProcessWalletPayment: COMPLETED for userID=%d with %d tickets\n", userID, len(ticketIds))
				return strings.Join(ticketIds, ","), nil
			}
		}
	} else {
		fmt.Printf("[WARN] Notification API is disabled; skip direct email dispatch in ticket-service\n")
	}
	fmt.Printf("[DEBUG] ProcessWalletPayment: COMPLETED for userID=%d with %d tickets\n", userID, len(ticketIds))
	return strings.Join(ticketIds, ","), nil
}

// ============================================================
// NOTIFICATION API HELPERS (Phase 6)
// ============================================================

// parseSeatCodeHelper splits seat code like "A5" into row="A" and number="5"
func parseSeatCodeHelper(seatCode string) (string, string) {
	if len(seatCode) == 0 {
		return "", ""
	}
	for i, c := range seatCode {
		if c >= '0' && c <= '9' {
			return seatCode[:i], seatCode[i:]
		}
	}
	return seatCode, "1"
}

func normalizeVNTimeString(timeValue interface{}) string {
	timeStr, _ := timeValue.(string)
	if strings.TrimSpace(timeStr) == "" {
		return ""
	}

	parsed, err := time.Parse(time.RFC3339, timeStr)
	if err != nil {
		return timeStr
	}

	return utils.ToVietnamTime(parsed).Format(time.RFC3339)
}

func formatVNClockFromRFC3339(timeValue interface{}) string {
	normalized := normalizeVNTimeString(timeValue)
	if strings.TrimSpace(normalized) == "" {
		return ""
	}

	parsed, err := time.Parse(time.RFC3339, normalized)
	if err != nil {
		return ""
	}

	return utils.FormatToVNTime(parsed)
}

// sendSingleTicketViaNotifyAPI sends single ticket email via Notification Service API.
// Payload must match SingleTicketData in notification handler (camelCase JSON).
func sendSingleTicketViaNotifyAPI(ctx context.Context, data map[string]interface{}) error {
	log := logger.Default()
	client := utils.NewInternalClient()
	baseURL := config.MustGetServiceURLWithFallback("Notification", "NOTIFICATION_SERVICE_URL", 8086)
	notifyURL := strings.TrimSuffix(baseURL, "/") + "/internal/notify/send-tickets"

	// Lấy các giá trị cần thiết từ snake_case map
	ticketID, _ := data["ticket_id"].(int)
	seatRow, _ := data["seat_row"].(string)
	seatNumber, _ := data["seat_number"].(string)
	categoryName, _ := data["category_name"].(string)
	startTime := normalizeVNTimeString(data["start_time"])
	endTime := normalizeVNTimeString(data["end_time"])
	startTimeDisplay := formatVNClockFromRFC3339(data["start_time"])
	endTimeDisplay := formatVNClockFromRFC3339(data["end_time"])
	userEmail, _ := data["user_email"].(string)

	fmt.Printf("[NOTIFY] 📧 Đang gửi vé #%d tới email %s...\n", ticketID, userEmail)

	// Chuyển đổi sang camelCase DTO theo SingleTicketData của notification handler
	payload := map[string]interface{}{
		"ticketIds": []int{ticketID},
		"singleTicket": map[string]interface{}{
			"ticketId":       ticketID,
			"ticketCode":     fmt.Sprintf("TKT_%d", ticketID),
			"userEmail":      userEmail,
			"userName":       data["user_name"],
			"eventTitle":     data["event_title"],
			"eventDate":      startTime,
			"endTime":        endTime,
			"venueName":      data["venue_name"],
			"venueAddress":   data["venue_address"],
			"areaName":       data["area_name"],
			"seatRow":        seatRow,
			"seatNumber":     seatNumber,
			"categoryName":   categoryName,
			"price":          data["price"],
			"totalAmount":    data["price"],
			"startTime":      startTime,
			"paymentMethod":  data["payment_method"],
			"mapUrl":         data["map_url"],
			"ticketIds":      fmt.Sprintf("%d", ticketID),
			"ticketTypes":    categoryName,
			"seatCodes":      fmt.Sprintf("%s%s", seatRow, seatNumber),
			"timeRange":      strings.TrimSpace(startTimeDisplay + " - " + endTimeDisplay),
			"organizerName":  data["organizer_name"],
			"organizerEmail": data["organizer_email"],
		},
	}

	respBody, statusCode, err := client.Post(ctx, notifyURL, payload)
	if err != nil {
		return fmt.Errorf("notification API call failed: %w", err)
	}
	if statusCode != 200 {
		return fmt.Errorf("notification API returned status %d: %s", statusCode, string(respBody))
	}

	log.Info("[NOTIFY] ✅ Single ticket email sent via Notification API", "ticket_id", ticketID, "email", userEmail)
	return nil
}

// sendMultipleTicketsViaNotifyAPI sends multiple tickets email via Notification Service API.
// Payload must match MultipleTicketsData in notification handler (camelCase JSON).
func sendMultipleTicketsViaNotifyAPI(ctx context.Context, data map[string]interface{}) error {
	log := logger.Default()
	client := utils.NewInternalClient()
	baseURL := config.MustGetServiceURLWithFallback("Notification", "NOTIFICATION_SERVICE_URL", 8086)
	notifyURL := strings.TrimSuffix(baseURL, "/") + "/internal/notify/send-tickets"

	userEmail, _ := data["user_email"].(string)
	userName, _ := data["user_name"].(string)
	eventAreaName, _ := data["area_name"].(string)
	startTime := normalizeVNTimeString(data["start_time"])
	endTime := normalizeVNTimeString(data["end_time"])
	startTimeDisplay := formatVNClockFromRFC3339(data["start_time"])
	endTimeDisplay := formatVNClockFromRFC3339(data["end_time"])

	// Chuyển đổi items → TicketPDFItem camelCase
	rawItems, _ := data["items"].([]map[string]interface{})
	ticketItems := []map[string]interface{}{}
	ticketIDs := []int{}
	seatCodeList := []string{}
	for _, item := range rawItems {
		ticketID, _ := item["ticket_id"].(int)
		ticketIDs = append(ticketIDs, ticketID)
		seatRow, _ := item["seat_row"].(string)
		seatNumber, _ := item["seat_number"].(string)
		seatCode, _ := item["seat_code"].(string)
		// area_name ở level item nếu có, fallback về level event
		itemArea, ok := item["area_name"].(string)
		if !ok || itemArea == "" {
			itemArea = eventAreaName
		}
		if seatCode != "" {
			seatCodeList = append(seatCodeList, seatCode)
		}
		ticketItems = append(ticketItems, map[string]interface{}{
			"ticketId":     ticketID,
			"ticketCode":   fmt.Sprintf("TKT_%d", ticketID),
			"eventDate":    startTime,
			"venueName":    data["venue_name"],
			"areaName":     itemArea,
			"venueAddress": data["venue_address"],
			"seatRow":      seatRow,
			"seatNumber":   seatNumber,
			"categoryName": item["category_name"],
			"price":        item["price"],
			"userName":     userName,
			"userEmail":    userEmail,
			"eventName":    data["event_title"],
		})
	}

	seatList := strings.Join(seatCodeList, ", ")
	fmt.Printf("[NOTIFY] 📧 Đang gửi %d vé tới email %s...\n", len(ticketItems), userEmail)

	payload := map[string]interface{}{
		"ticketIds": ticketIDs,
		"multipleTickets": map[string]interface{}{
			"userEmail":      userEmail,
			"userName":       userName,
			"eventTitle":     data["event_title"],
			"eventDate":      startTime,
			"endTime":        endTime,
			"venueName":      data["venue_name"],
			"venueAddress":   data["venue_address"],
			"seatList":       seatList,
			"totalAmount":    data["total_amount"],
			"googleMapsUrl":  data["map_url"],
			"organizerName":  data["organizer_name"],
			"organizerEmail": data["organizer_email"],
			"tickets":        ticketItems,
			"timeRange":      strings.TrimSpace(startTimeDisplay + " - " + endTimeDisplay),
		},
	}

	respBody, statusCode, err := client.Post(ctx, notifyURL, payload)
	if err != nil {
		return fmt.Errorf("notification API call failed: %w", err)
	}
	if statusCode != 200 {
		return fmt.Errorf("notification API returned status %d: %s", statusCode, string(respBody))
	}

	log.Info("[NOTIFY] ✅ Multiple tickets email sent via Notification API", "ticket_count", len(ticketItems), "email", userEmail)
	return nil
}

// GetActiveOrderForSeats - Lấy thông tin đơn hàng pending đang hoạt động cho danh sách ghế
func (r *TicketRepository) GetActiveOrderForSeats(ctx context.Context, seatIDs []int) (map[string]interface{}, error) {
	if len(seatIDs) == 0 {
		return nil, fmt.Errorf("no seats provided")
	}

	// Tìm xem có vé PENDING nào liên kết với hóa đơn PENDING cho ghế này không
	query := `
		SELECT t.bill_id, b.total_amount, b.created_at
		FROM Ticket t
		JOIN Bill b ON t.bill_id = b.bill_id
		WHERE t.seat_id = $1 AND t.status = 'PENDING' AND b.payment_status = 'PENDING'
		LIMIT 1
	`
	var billID int64
	var totalAmount float64
	var createdAt time.Time
	err := r.db.QueryRowContext(ctx, query, seatIDs[0]).Scan(&billID, &totalAmount, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Không có order hoạt động
		}
		return nil, err
	}

	// Kiểm tra nếu đã quá hạn 5 phút thực tế
	now := time.Now()
	if now.Sub(createdAt) > 5*time.Minute {
		return nil, nil // Đã quá hạn
	}

	expiresAt := createdAt.Add(5 * time.Minute)

	return map[string]interface{}{
		"order_id":   billID,
		"amount":     totalAmount,
		"created_at": createdAt.Format(time.RFC3339),
		"createdAt":  createdAt.Format(time.RFC3339),
		"expire_at":  expiresAt.Format(time.RFC3339),
		"expiresAt":  expiresAt.Format(time.RFC3339),
		"seatIds":    seatIDs,
	}, nil
}

func equalIntSlices(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	m := make(map[int]int)
	for _, v := range a {
		m[v]++
	}
	for _, v := range b {
		if m[v] == 0 {
			return false
		}
		m[v]--
	}
	return true
}


func (r *TicketRepository) ProcessWalletPaymentForExistingBill(ctx context.Context, userID int, pendingBillID int64, amount int) (string, error) {
	opts := &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  false,
	}
	tx, err := r.db.BeginTx(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	var currentBalance float64
	var walletID int
	lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
	err = tx.QueryRowContext(ctx, lockQuery, userID).Scan(&walletID, &currentBalance)
	if err != nil {
		return "", fmt.Errorf("error locking wallet balance: %w", err)
	}

	if currentBalance < float64(amount) {
		insufficientAmount := float64(amount) - currentBalance
		return "", fmt.Errorf("insufficient_balance|%d|%.0f", int(insufficientAmount), currentBalance)
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT ticket_id, seat_id FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'
	`, pendingBillID)
	if err != nil {
		return "", fmt.Errorf("error fetching pending tickets: %w", err)
	}

	type ticketInfo struct {
		ticketID int64
		seatID   int
	}
	var tickets []ticketInfo
	for rows.Next() {
		var tid int64
		var sid int
		if err := rows.Scan(&tid, &sid); err == nil {
			tickets = append(tickets, ticketInfo{ticketID: tid, seatID: sid})
		}
	}
	rows.Close()

	if len(tickets) == 0 {
		return "", fmt.Errorf("no pending tickets found for bill %d", pendingBillID)
	}

	ticketIds := []string{}
	qrValues := []string{}
	ticketTypes := []string{}
	seatCodes := []string{}
	categoryNames := []string{}
	prices := []float64{}
	areaNames := []string{}
	var eventTitle, venueName, venueAddress, userEmail, userName, seatCode string
	var totalPrice float64
	var startTime, endTime time.Time
	var eventID int

	for _, t := range tickets {
		qrBase64, err := qrcode.GenerateTicketQRBase64(int(t.ticketID), 300)
		if err != nil {
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", t.ticketID)
		}

		_, err = tx.ExecContext(ctx, `
			UPDATE Ticket SET qr_code_value = $1, status = 'BOOKED' WHERE ticket_id = $2
		`, qrBase64, t.ticketID)
		if err != nil {
			return "", fmt.Errorf("error updating ticket status: %w", err)
		}

		ticketIds = append(ticketIds, fmt.Sprintf("%d", t.ticketID))
		qrValues = append(qrValues, qrBase64)

		selectQuery := `
			SELECT 
				t.event_id,
				e.title,
				e.start_time,
				e.end_time,
				v.location,
				v.venue_name,
				va.area_name,
				s.seat_code,
				ct.name as category_name,
				ct.price,
				u.email,
				u.full_name
			FROM Ticket t
			JOIN Event e ON t.event_id = e.event_id
			JOIN Venue_Area va ON e.area_id = va.area_id
			JOIN Venue v ON va.venue_id = v.venue_id
			JOIN Seat s ON t.seat_id = s.seat_id
			JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			JOIN users u ON t.user_id = u.user_id
			WHERE t.ticket_id = $1
		`
		var categoryName, areaName string
		var price float64
		err = tx.QueryRowContext(ctx, selectQuery, t.ticketID).Scan(
			&eventID,
			&eventTitle,
			&startTime,
			&endTime,
			&venueAddress,
			&venueName,
			&areaName,
			&seatCode,
			&categoryName,
			&price,
			&userEmail,
			&userName,
		)
		if err == nil {
			ticketTypes = append(ticketTypes, categoryName)
			seatCodes = append(seatCodes, seatCode)
			categoryNames = append(categoryNames, categoryName)
			prices = append(prices, price)
			areaNames = append(areaNames, areaName)
			totalPrice += price
		}
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE Bill SET payment_status = 'PAID', paid_at = NOW(), payment_method = 'Wallet' WHERE bill_id = $1
	`, pendingBillID)
	if err != nil {
		return "", fmt.Errorf("error updating bill to PAID: %w", err)
	}



	newBalance := currentBalance - float64(amount)
	_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = $1 WHERE wallet_id = $2", newBalance, walletID)
	if err != nil {
		return "", fmt.Errorf("error deducting wallet balance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("error committing wallet transaction: %w", err)
	}

	emailTickets := make([]map[string]interface{}, len(ticketIds))
	for i := range ticketIds {
		emailTickets[i] = map[string]interface{}{
			"ticketId":     ticketIds[i],
			"ticketType":   ticketTypes[i],
			"seatCode":     seatCodes[i],
			"qrCodeValue":  qrValues[i],
			"categoryName": categoryNames[i],
			"price":        prices[i],
			"areaName":     areaNames[i],
		}
	}

	go func() {
		emailPayload := map[string]interface{}{
			"userEmail":    userEmail,
			"userName":     userName,
			"eventTitle":   eventTitle,
			"eventTime":    startTime.Format("02-01-2006 15:04"),
			"venueName":    venueName,
			"venueAddress": venueAddress,
			"totalPrice":   totalPrice,
			"tickets":      emailTickets,
		}
		client := utils.NewInternalClient()
		emailURL := utils.GetTicketServiceURL() + "/internal/email/send-ticket"
		var response struct{}
		client.PostJSON(context.Background(), emailURL, emailPayload, &response)
	}()

	return strings.Join(ticketIds, ","), nil
}

func (r *TicketRepository) GetBillCreatedAt(ctx context.Context, billID int) (time.Time, error) {
	var createdAt time.Time
	err := r.db.QueryRowContext(ctx, "SELECT created_at FROM Bill WHERE bill_id = $1", billID).Scan(&createdAt)
	return createdAt, err
}

func (r *TicketRepository) GetTicketIDsByBillID(ctx context.Context, billID int64) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT ticket_id FROM Ticket WHERE bill_id = $1", billID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, strconv.FormatInt(id, 10))
		}
	}
	return ids, nil
}

func generateDeterministicUUID(userID, eventID int, seatIDs []int) string {
	// Sort seatIDs to ensure same seats in any order produce the same UUID
	sortedSeatIDs := make([]int, len(seatIDs))
	copy(sortedSeatIDs, seatIDs)
	for i := 0; i < len(sortedSeatIDs); i++ {
		for j := i + 1; j < len(sortedSeatIDs); j++ {
			if sortedSeatIDs[i] > sortedSeatIDs[j] {
				sortedSeatIDs[i], sortedSeatIDs[j] = sortedSeatIDs[j], sortedSeatIDs[i]
			}
		}
	}

	seatStrParts := make([]string, len(sortedSeatIDs))
	for i, sid := range sortedSeatIDs {
		seatStrParts[i] = strconv.Itoa(sid)
	}

	input := fmt.Sprintf("free_ticket:%d:%d:%s", userID, eventID, strings.Join(seatStrParts, ","))
	hash := sha256.Sum256([]byte(input))
	
	// Create UUID RFC 4122 Variant from SHA-256 hash (v4-like layout)
	// Modify the version (4) and variant (1) bits:
	hash[6] = (hash[6] & 0x0f) | 0x40
	hash[8] = (hash[8] & 0x3f) | 0x80

	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		hash[0:4],
		hash[4:6],
		hash[6:8],
		hash[8:10],
		hash[10:16],
	)
}
