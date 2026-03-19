package repository

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/email"
	apperrors "github.com/fpt-event-services/common/errors"
	"github.com/fpt-event-services/common/logger"
	ticketpdf "github.com/fpt-event-services/common/pdf"
	"github.com/fpt-event-services/common/qrcode"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/common/vnpay"
	"github.com/fpt-event-services/services/ticket-lambda/models"
	ticketutils "github.com/fpt-event-services/services/ticket-lambda/utils"
)

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
			e.start_time AS purchase_date
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE t.user_id = ?
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
	whereConditions := []string{"t.user_id = ?"}
	args := []interface{}{userID}

	// Search theo tên sự kiện
	if search != "" {
		whereConditions = append(whereConditions, "e.title LIKE ?")
		args = append(args, "%"+search+"%")
	}

	// Filter theo status
	if status != "" {
		whereConditions = append(whereConditions, "t.status = ?")
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
			e.start_time AS purchase_date
		FROM Ticket t
		LEFT JOIN Event e ON t.event_id = e.event_id
		LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Venue_Area va ON e.area_id = va.area_id
		LEFT JOIN Venue v ON va.venue_id = v.venue_id
		LEFT JOIN Users u ON t.user_id = u.user_id
		WHERE %s
		ORDER BY t.ticket_id DESC
		LIMIT ? OFFSET ?
	`, whereClause)

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
func (r *TicketRepository) GetTicketsByRole(ctx context.Context, role string, userID int, eventID *int) ([]models.MyTicketResponse, error) {
	var query string
	var args []interface{}

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
			e.start_time AS purchase_date
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
			query = baseQuery + " WHERE t.event_id = ? ORDER BY t.ticket_id DESC"
			args = append(args, *eventID)
		} else {
			query = baseQuery + " ORDER BY t.ticket_id DESC"
		}
	case "ORGANIZER":
		// Organizer sees tickets for their events only
		if eventID != nil {
			query = baseQuery + " WHERE e.created_by = ? AND t.event_id = ? ORDER BY t.ticket_id DESC"
			args = append(args, userID, *eventID)
		} else {
			query = baseQuery + " WHERE e.created_by = ? ORDER BY t.ticket_id DESC"
			args = append(args, userID)
		}
	default:
		// Regular user sees only their own tickets
		query = baseQuery + " WHERE t.user_id = ? ORDER BY t.ticket_id DESC"
		args = append(args, userID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query tickets by role: %w", err)
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

		tickets = append(tickets, ticket)
	}

	return tickets, nil
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
			GREATEST(0, ct.max_quantity - COUNT(CASE WHEN t.status IN ('PENDING', 'BOOKED', 'CHECKED_IN') THEN 1 END)) AS remaining
		FROM Category_Ticket ct
		LEFT JOIN Ticket t ON ct.category_ticket_id = t.category_ticket_id
		WHERE ct.event_id = ?
		GROUP BY ct.category_ticket_id, ct.event_id, ct.name, ct.description, ct.price, ct.max_quantity, ct.status
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

		fmt.Printf("[TICKET] Category: %s | Giá: %.0f VNĐ | Còn lại: %d/%d\n",
			ct.Name, ct.Price, ct.Remaining, ct.MaxQuantity)

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
		WHERE b.user_id = ?
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
	whereConditions := []string{"b.user_id = ?"}
	args := []interface{}{userID}

	// Search theo mã hóa đơn
	if search != "" {
		whereConditions = append(whereConditions, "CAST(b.bill_id AS CHAR) LIKE ?")
		args = append(args, "%"+search+"%")
	}

	// Filter theo payment status
	if paymentStatus != "" {
		whereConditions = append(whereConditions, "b.payment_status = ?")
		args = append(args, paymentStatus)
	}

	// Filter theo payment method
	if paymentMethod != "" {
		whereConditions = append(whereConditions, "b.payment_method = ?")
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
		LIMIT ? OFFSET ?
	`, whereClause)

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

// ============================================================
// VNPAY PAYMENT METHODS
// KHỚP VỚI Java PaymentService & BuyTicketService
// PRODUCTION-READY với HMAC-SHA512 signature verification
// ============================================================

// vnpayService singleton
var vnpayService *vnpay.VNPayService

// getVNPayService returns singleton VNPay service
func getVNPayService() *vnpay.VNPayService {
	if vnpayService == nil {
		vnpayService = vnpay.NewVNPayService(vnpay.DefaultConfig())
	}
	return vnpayService
}

// CreateVNPayURL - Tạo URL thanh toán VNPay cho nhiều ghế
// KHỚP VỚI Java: PaymentService.createPaymentUrl()
// PRODUCTION: Sử dụng HMAC-SHA512 signature
// UPDATED: Hỗ trợ mua nhiều ghế cùng lúc (max 4 ghế)
func (r *TicketRepository) CreateVNPayURL(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, returnURL string) (string, error) {
	log := logger.Default().WithContext(ctx)

	// Validate số lượng ghế (max 4)
	if len(seatIDs) == 0 {
		return "", apperrors.BusinessError("Vui lòng chọn ít nhất 1 ghế")
	}
	if len(seatIDs) > 4 {
		return "", apperrors.BusinessError("Chỉ được mua tối đa 4 ghế mỗi lần")
	}

	// Kiểm tra event có tồn tại và đang active không
	var eventTitle string
	var status string
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, "SELECT title, status, start_time FROM Event WHERE event_id = ?", eventID).Scan(&eventTitle, &status, &startTime)
	if err != nil {
		log.Error("Event not found", "event_id", eventID, "error", err)
		return "", apperrors.NotFound("Sự kiện")
	}
	// Event phải ở trạng thái OPEN để có thể mua vé
	// ENUM: 'OPEN','CLOSED','CANCELLED','DRAFT'
	if status != "OPEN" {
		log.Warn("Event not open", "event_id", eventID, "status", status)
		return "", apperrors.BusinessError(fmt.Sprintf("Sự kiện không mở bán vé (trạng thái: %s)", status))
	}

	// ⭐ SECURITY: Kiểm tra xem event đã bắt đầu chưa
	// Nếu thời gian hiện tại >= start_time: từ chối đặt vé
	now := time.Now()
	if now.After(startTime) || now.Equal(startTime) {
		log.Warn("[BOOKING_SECURITY] User blocked from buying ticket for event that has started",
			"user_id", userID, "event_id", eventID, "event_start_time", startTime, "current_time", now)
		return "", apperrors.BusinessError("Sự kiện đã bắt đầu hoặc kết thúc, không thể đặt thêm vé")
	}

	// Kiểm tra TẤT CẢ ghế có active và available không
	pendingTicketIDs := []int64{}
	var totalAmount float64 // Tổng tiền theo giá DECIMAL từ DB

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
		// Kiểm tra ghế có active không và lấy category thực tế của ghế.
		var seatStatus string
		var seatCategoryTicketID sql.NullInt64
		var catName sql.NullString
		var catStatus sql.NullString
		var pricePerSeat sql.NullFloat64
		var maxQty sql.NullInt64

		err = r.db.QueryRowContext(ctx, `
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
				AND ct.event_id = ?
			WHERE s.seat_id = ?
		`, eventID, seatID).Scan(&seatStatus, &seatCategoryTicketID, &catName, &catStatus, &pricePerSeat, &maxQty)
		if err != nil {
			log.Error("Seat not found", "seat_id", seatID, "error", err)
			return "", apperrors.NotFound(fmt.Sprintf("Ghế ID %d", seatID))
		}
		if seatStatus != "ACTIVE" {
			return "", apperrors.BusinessError(fmt.Sprintf("Ghế ID %d không khả dụng", seatID))
		}
		if !seatCategoryTicketID.Valid {
			return "", apperrors.BusinessError(fmt.Sprintf("Ghế ID %d chưa được gán loại vé", seatID))
		}

		currentCategoryTicketID := int(seatCategoryTicketID.Int64)
		if resolvedCategoryTicketID == 0 {
			resolvedCategoryTicketID = currentCategoryTicketID
		}

		meta, ok := categoryMap[currentCategoryTicketID]
		if !ok {
			if !catStatus.Valid || catStatus.String != "ACTIVE" {
				return "", apperrors.BusinessError(fmt.Sprintf("Loại vé của ghế ID %d không khả dụng", seatID))
			}

			var soldCount int
			if queryErr := r.db.QueryRowContext(ctx,
				"SELECT COUNT(*) FROM Ticket WHERE category_ticket_id = ? AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')",
				currentCategoryTicketID,
			).Scan(&soldCount); queryErr != nil {
				fmt.Printf("[TICKET] Cảnh báo: không đếm được sold count cho category %d: %v\n", currentCategoryTicketID, queryErr)
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
			return "", apperrors.BusinessError(fmt.Sprintf("Ticket Sold Out - Loại vé '%s' đã hết. Còn lại: 0/%d", meta.Name, meta.MaxQty))
		}
		if meta.SoldCount+meta.Requested > meta.MaxQty {
			return "", apperrors.BusinessError(fmt.Sprintf("Không đủ vé cho loại '%s'. Còn lại: %d, Yêu cầu: %d", meta.Name, remaining, meta.Requested))
		}

		// RACE CONDITION CHECK: Kiểm tra ghế đã bị giữ/đặt chưa
		var existingTicketCount int
		err = r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM Ticket 
			 WHERE event_id = ? AND seat_id = ? AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN')`,
			eventID, seatID,
		).Scan(&existingTicketCount)
		if err != nil {
			log.Error("Error checking existing tickets", "error", err)
			return "", apperrors.DatabaseError(err)
		}
		if existingTicketCount > 0 {
			log.Warn("Seat already reserved/booked", "event_id", eventID, "seat_id", seatID)
			return "", apperrors.BusinessError(fmt.Sprintf("Ghế ID %d đã được người khác giữ/đặt", seatID))
		}

		// TẠO PENDING TICKET để giữ chỗ
		pendingResult, err := r.db.ExecContext(ctx,
			`INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at) 
			 VALUES (?, ?, ?, ?, 'PENDING_QR', 'PENDING', NOW())`,
			userID, eventID, currentCategoryTicketID, seatID,
		)
		if err != nil {
			log.Error("Failed to create PENDING ticket", "seat_id", seatID, "error", err)
			// Rollback: xóa tất cả PENDING tickets đã tạo
			for _, tid := range pendingTicketIDs {
				r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ?", tid)
			}
			return "", apperrors.BusinessError(fmt.Sprintf("Không thể giữ ghế ID %d", seatID))
		}

		pendingTicketID, _ := pendingResult.LastInsertId()
		pendingTicketIDs = append(pendingTicketIDs, pendingTicketID)
		totalAmount += meta.Price

		log.Info("[INVOICE DEBUG] Seat Added To Bill",
			"seat_id", seatID,
			"category_ticket_id", currentCategoryTicketID,
			"price_per_seat", meta.Price,
			"running_total", totalAmount,
			"seat_position", len(pendingTicketIDs))
	}

	// Tạo mã giao dịch - Chứa ALL pendingTicketIDs (comma-separated)
	timestamp := fmt.Sprintf("%d", time.Now().UnixMilli())
	// Format: userID_eventID_categoryID_ticketIDs_timestamp
	// ticketIDs: "123,124,125,126" (tối đa 4 IDs)
	ticketIDsStr := ""
	for i, tid := range pendingTicketIDs {
		if i > 0 {
			ticketIDsStr += ","
		}
		ticketIDsStr += fmt.Sprintf("%d", tid)
	}
	txnRef := fmt.Sprintf("%d_%d_%d_%s_%s", userID, eventID, resolvedCategoryTicketID, ticketIDsStr, timestamp)

	// Tạo orderInfo
	orderInfo := fmt.Sprintf("Payment for %s - %d seats", eventTitle, len(seatIDs))

	// ✅ 0đ BYPASS: Nếu giá vé = 0, tạo vé BOOKED trực tiếp mà không cần VNPay
	if totalAmount == 0 {
		fmt.Printf("[TICKET] 🎉 Vé miễn phí (0đ) - Event: %d. Tạo BOOKED trực tiếp, bỏ qua VNPay.\n", eventID)

		// Tạo 1 Bill duy nhất cho toàn bộ lô vé miễn phí
		var freeBillID int64
		billResult, billErr := r.db.ExecContext(ctx,
			`INSERT INTO Bill (user_id, total_amount, payment_method, payment_status, created_at, paid_at)
			 VALUES (?, 0, 'FREE', 'PAID', NOW(), NOW())`,
			userID,
		)
		if billErr != nil {
			fmt.Printf("[TICKET] Cảnh báo: không tạo được Bill miễn phí: %v\n", billErr)
		} else {
			freeBillID, _ = billResult.LastInsertId()
		}

		bookedIDsFree := make([]int, 0, len(pendingTicketIDs))
		for _, tid := range pendingTicketIDs {
			// Liên kết vé với Bill
			if freeBillID > 0 {
				r.db.ExecContext(ctx,
					`INSERT INTO Bill_Detail (bill_id, ticket_id, price) VALUES (?, ?, 0)`,
					freeBillID, tid,
				)
			}
			// Cập nhật Ticket sang BOOKED với QR code thực (cùng logic với VNPay flow)
			qrBase64, qrErr := qrcode.GenerateTicketQRBase64(int(tid), 300)
			if qrErr != nil {
				fmt.Printf("[TICKET] ⚠️ Không tạo được QR cho ticket %d: %v — dùng fallback\n", tid, qrErr)
				qrBase64 = fmt.Sprintf("FREE-%d-%s", tid, timestamp)
			}
			_, updateErr := r.db.ExecContext(ctx,
				`UPDATE Ticket SET status = 'BOOKED', qr_code_value = ? WHERE ticket_id = ?`,
				qrBase64, tid,
			)
			if updateErr != nil {
				fmt.Printf("[TICKET] Lỗi cập nhật ticket %d sang BOOKED: %v\n", tid, updateErr)
			} else {
				fmt.Printf("[TICKET] ✅ Ticket %d → BOOKED (miễn phí, QR=%d bytes)\n", tid, len(qrBase64))
				bookedIDsFree = append(bookedIDsFree, int(tid))
			}
		}

		// 📧 Gửi email vé điện tử (non-blocking, cùng cơ chế với VNPay)
		// ⭐ FIX: dùng context.Background() để goroutine không bị cancel khi HTTP request kết thúc
		go r.sendMultipleTicketEmailsAsync(context.Background(), userID, eventID, bookedIDsFree, "0", resolvedCategoryTicketID, int(freeBillID))

		// 🔔 Kích hoạt Notification Service gửi PDF vé (non-blocking)
		go ticketutils.CallNotificationService(bookedIDsFree)

		// Trả về chuỗi đặc biệt để handler nhận biết là vé miễn phí
		return "FREE:" + ticketIDsStr, nil
	}

	// ⭐ LOGGING DEBUG: Theo dõi chi tiết giá trị tiền tệ
	log.Info("[INVOICE DEBUG] CreateVNPayURL - Final Calculation",
		"seat_count", len(seatIDs),
		"total_amount_vnd", totalAmount,
		"price_type", "float64",
		"calculation_method", "price_per_seat x seat_count",
	)

	// SỬ DỤNG VNPAY SERVICE VỚI PROPER SIGNATURE
	service := getVNPayService()
	paymentURL, err := service.CreatePaymentURL(vnpay.PaymentRequest{
		OrderInfo: orderInfo,
		Amount:    totalAmount, // totalAmount đã là float64
		TxnRef:    txnRef,
		IPAddr:    "127.0.0.1",
		ReturnURL: strings.TrimSpace(returnURL),
	})
	if err != nil {
		// Rollback: xóa TẤT CẢ PENDING tickets
		for _, tid := range pendingTicketIDs {
			r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ?", tid)
		}
		log.Error("Failed to create VNPay URL", "error", err)
		return "", apperrors.VNPayError("Không thể tạo link thanh toán")
	}

	log.LogEvent(logger.EventLog{
		Event:    "PAYMENT_INITIATED",
		UserID:   userID,
		EntityID: eventID,
		Entity:   "Event",
		Action:   "CREATE_PAYMENT",
		Success:  true,
		Metadata: map[string]interface{}{
			"amount":             totalAmount,
			"txn_ref":            txnRef,
			"seat_count":         len(seatIDs),
			"seat_ids":           seatIDs,
			"pending_ticket_ids": pendingTicketIDs,
		},
	})

	return paymentURL, nil
}

// ProcessVNPayCallback - Xử lý callback từ VNPay
// KHỚP VỚI Java: BuyTicketService.processPayment()
// PRODUCTION: Verify HMAC-SHA512 signature trước khi xử lý
// UPDATED: Hỗ trợ update NHIỀU PENDING tickets thành BOOKED
func (r *TicketRepository) ProcessVNPayCallback(ctx context.Context, amount, responseCode, orderInfo, txnRef, secureHash string) (string, error) {
	log := logger.Default().WithContext(ctx)

	// Log callback receipt
	log.Info("VNPay callback received", "txn_ref", txnRef, "response_code", responseCode)

	// Parse txnRef: userID_eventID_categoryTicketID_ticketIDs_timestamp
	// ticketIDs format: "123,124,125,126" (comma-separated)
	parts := strings.Split(txnRef, "_")
	if len(parts) < 5 {
		return "Invalid transaction reference format", fmt.Errorf("invalid txn ref: %s", txnRef)
	}

	userID, err := strconv.Atoi(parts[0])
	if err != nil {
		return "Invalid userID in txn ref", err
	}

	eventID, err := strconv.Atoi(parts[1])
	if err != nil {
		return "Invalid eventID in txn ref", err
	}

	categoryTicketID, err := strconv.Atoi(parts[2])
	if err != nil {
		return "Invalid categoryTicketID in txn ref", err
	}

	// Parse ticket IDs (comma-separated: "123,124,125,126")
	ticketIDsStr := parts[3]
	ticketIDStrs := strings.Split(ticketIDsStr, ",")
	pendingTicketIDs := []int{}
	for _, tidStr := range ticketIDStrs {
		tid, err := strconv.Atoi(strings.TrimSpace(tidStr))
		if err != nil {
			return "Invalid ticket IDs in txn ref", err
		}
		pendingTicketIDs = append(pendingTicketIDs, tid)
	}

	if len(pendingTicketIDs) == 0 {
		return "No ticket IDs in txn ref", fmt.Errorf("empty ticket IDs")
	}

	log.Info("Parsed txnRef", "user_id", userID, "event_id", eventID, "ticket_ids", pendingTicketIDs)

	// Check response code
	if responseCode != "00" {
		log.Warn("Payment failed/cancelled", "txn_ref", txnRef, "response_code", responseCode)

		// Xóa TẤT CẢ PENDING tickets
		for _, tid := range pendingTicketIDs {
			r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ? AND status = 'PENDING'", tid)
			log.Info("Deleted PENDING ticket after failed payment", "ticket_id", tid)
		}

		return "Payment was cancelled or failed. Response code: " + responseCode, apperrors.PaymentFailed(responseCode)
	}

	// ⭐ SECURITY: Double-check event time even at callback time
	// In case event started after payment was initiated but before callback came back
	var eventStatus string
	var startTime time.Time
	err = r.db.QueryRowContext(ctx, "SELECT status, start_time FROM Event WHERE event_id = ?", eventID).Scan(&eventStatus, &startTime)
	if err != nil {
		log.Error("Event validation failed", "event_id", eventID, "error", err)
		// Clean up pending tickets
		for _, tid := range pendingTicketIDs {
			r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ? AND status = 'PENDING'", tid)
		}
		return "Event not found", err
	}

	// Check if event has already started
	now := time.Now()
	if now.After(startTime) || now.Equal(startTime) {
		log.Warn("[BOOKING_SECURITY] Payment callback rejected - Event has started",
			"user_id", userID, "event_id", eventID, "event_start_time", startTime, "current_time", now)
		// Clean up pending tickets
		for _, tid := range pendingTicketIDs {
			r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ? AND status = 'PENDING'", tid)
		}
		return "Event has started, booking is not allowed", fmt.Errorf("event already started")
	}

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "Database error", err
	}
	defer tx.Rollback()

	// 1. Tạo Bill cho toàn bộ giao dịch
	// ⭐ CRITICAL FIX: amount từ VNPay callback là vnp_Amount (đã nhân 100)
	// PHẢI chia 100 trước khi lưu vào Database
	var billAmount float64
	amountFromVNPay, err := strconv.ParseFloat(amount, 64)
	if err != nil {
		log.Error("[CURRENCY ERROR] Failed to parse amount from VNPay", "amount", amount, "error", err)
		return "Invalid amount format", err
	}
	billAmount = amountFromVNPay / 100 // Chia 100 để lấy giá trị VND thực tế

	// ⭐ DEBUG: In ra toàn bộ quá trình tính toán
	fmt.Printf("\n========== BILL CURRENCY CALCULATION ==========\n")
	fmt.Printf("[1] amount (raw string from VNPay callback): %s\n", amount)
	fmt.Printf("[2] amountFromVNPay (parsed float64): %.2f\n", amountFromVNPay)
	fmt.Printf("[3] billAmount (after divide by 100): %.2f\n", billAmount)
	fmt.Printf("[4] billAmount will be saved to DB: %.0f\n", billAmount)
	fmt.Printf("=============================================\n\n")

	log.Info("[CURRENCY DEBUG] ProcessVNPayCallback - Creating Bill",
		"amount_from_vnpay_callback", amountFromVNPay,
		"amount_after_divide_100", billAmount,
		"user_id", userID,
	)

	billResult, err := tx.ExecContext(ctx,
		"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES (?, ?, 'VND', 'VNPAY', 'PAID', NOW(), NOW())",
		userID, billAmount,
	)

	fmt.Printf("[INSERT] SAVING TO DB - user_id: %d, total_amount (billAmount): %.0f\n", userID, billAmount)
	if err != nil {
		return "Failed to create bill", err
	}

	billID, err := billResult.LastInsertId()
	if err != nil {
		return "Failed to get bill ID", err
	}

	fmt.Printf("[BILL_CREATED] ✅ Da xuat hoa don ID: %d cho phuong thuc: %s\n", billID, "VNPAY")

	// 2. Update TẤT CẢ PENDING tickets thành BOOKED với QR codes
	bookedTicketIDs := []int{}
	for _, ticketID := range pendingTicketIDs {
		// Generate QR code
		qrBase64, err := qrcode.GenerateTicketQRBase64(ticketID, 300)
		if err != nil {
			log.Error("Failed to generate QR code", "ticket_id", ticketID, "error", err)
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
		}

		// Update ticket
		updateResult, err := tx.ExecContext(ctx,
			`UPDATE Ticket SET status = 'BOOKED', bill_id = ?, qr_code_value = ? WHERE ticket_id = ? AND status = 'PENDING'`,
			billID, qrBase64, ticketID,
		)
		if err != nil {
			log.Error("Failed to update ticket", "ticket_id", ticketID, "error", err)
			return "Failed to update ticket", err
		}

		rowsAffected, _ := updateResult.RowsAffected()
		if rowsAffected == 0 {
			log.Warn("PENDING ticket not found", "ticket_id", ticketID)
			return fmt.Sprintf("Ticket ID %d đã hết thời gian giữ chỗ", ticketID), fmt.Errorf("ticket %d expired", ticketID)
		}

		bookedTicketIDs = append(bookedTicketIDs, ticketID)
		log.Info("Ticket updated to BOOKED", "ticket_id", ticketID, "qr_length", len(qrBase64))
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return "Failed to commit transaction", err
	}

	log.LogEvent(logger.EventLog{
		Event:    "PAYMENT_SUCCESS",
		UserID:   userID,
		EntityID: eventID,
		Entity:   "Ticket",
		Action:   "BOOKED",
		Success:  true,
		Metadata: map[string]interface{}{
			"ticket_ids":   bookedTicketIDs,
			"ticket_count": len(bookedTicketIDs),
			"bill_id":      billID,
			"amount":       amount,
		},
	})

	// 3. GỬI EMAIL với NHIỀU PDF attachments
	// ⭐ CRITICAL FIX: billAmount đã là giá trị VND gốc (chia 100 từ callback)
	log.Info("[CURRENCY DEBUG] VNPay callback processed",
		"original_vnp_amount", amountFromVNPay,
		"billAmount_for_email", billAmount,
		"ticket_count", len(bookedTicketIDs))

	// Convert billAmount float64 to string format cho email
	realAmount := fmt.Sprintf("%.0f", billAmount)
	// ⭐ FIX: dùng context.Background() để goroutine không bị cancel khi HTTP request kết thúc
	go r.sendMultipleTicketEmailsAsync(context.Background(), userID, eventID, bookedTicketIDs, realAmount, categoryTicketID, int(billID))
	// 🔔 Kích hoạt Notification Service gửi PDF vé (non-blocking)
	go ticketutils.CallNotificationService(bookedTicketIDs)

	// Trả về comma-separated ticket IDs
	ticketIDsResult := ""
	for i, tid := range bookedTicketIDs {
		if i > 0 {
			ticketIDsResult += ","
		}
		ticketIDsResult += fmt.Sprintf("%d", tid)
	}
	return ticketIDsResult, nil
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
		"SELECT email, full_name FROM Users WHERE user_id = ?",
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
		"SELECT qr_code_value FROM Ticket WHERE ticket_id = ?",
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
		 WHERE e.event_id = ?`,
		eventID,
	).Scan(&eventTitle, &startTime, &areaID, &areaName, &venueName, &venueLocation)
	if err != nil {
		log.Error("Failed to get event for email", "event_id", eventID, "error", err)
		return
	}

	// Lấy thông tin ghế
	var seatCode string
	r.db.QueryRowContext(bgCtx,
		"SELECT seat_code FROM Seat WHERE seat_id = ?",
		seatID,
	).Scan(&seatCode)

	// Lấy thông tin loại vé
	var categoryName string
	r.db.QueryRowContext(bgCtx,
		"SELECT name FROM Category_Ticket WHERE category_ticket_id = ?",
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

	// Phase 6: Dual path - Notification API or local PDF+email
	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		// Route through Notification Service API
		if err := sendSingleTicketViaNotifyAPI(bgCtx, map[string]interface{}{
			"ticket_id":      ticketID,
			"user_email":     userEmail,
			"user_name":      userName,
			"event_title":    eventTitle,
			"start_time":     startTime.Format(time.RFC3339),
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
			log.Warn("Notification API failed, falling back to local", "error", err)
		} else {
			log.Info("Ticket email sent via Notification API", "ticket_id", ticketID)
			return
		}
	}

	// Legacy path: Generate PDF locally + send email directly
	// Generate QR PNG bytes từ Base64 để tạo PDF
	var qrPngBytes []byte
	if qrBase64 != "" && !strings.HasPrefix(qrBase64, "PENDING_QR") {
		// Decode Base64 to PNG bytes
		qrPngBytes, err = parseBase64ToPNG(qrBase64)
		if err != nil {
			log.Warn("Failed to decode QR Base64 for PDF", "ticket_id", ticketID, "error", err)
		}
	}

	// Generate PDF vé điện tử
	var pdfBytes []byte
	var pdfFilename string
	if qrPngBytes != nil && len(qrPngBytes) > 0 {
		pdfBytes, err = ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
			TicketCode:     fmt.Sprintf("TKT_%d", ticketID),
			EventName:      eventTitle,
			EventDate:      startTime,
			VenueName:      finalVenueName,
			AreaName:       finalAreaName,
			Address:        finalVenueAddress,
			SeatRow:        seatRow,
			SeatNumber:     seatNumber,
			CategoryName:   categoryName,
			Price:          formattedAmount,
			UserName:       userName,
			UserEmail:      userEmail,
			QRCodePngBytes: qrPngBytes,
		})
		if err != nil {
			log.Error("Failed to generate PDF", "ticket_id", ticketID, "error", err)
			pdfBytes = nil
		} else {
			pdfFilename = fmt.Sprintf("ticket_%d_%s.pdf", ticketID, seatCode)
			log.Info("PDF generated successfully", "filename", pdfFilename, "size_bytes", len(pdfBytes))
		}
	}

	// Gửi email với QR code Base64 trong body + PDF attachment (KHỚP VỚI JAVA)
	emailService := email.NewEmailService(nil)
	err = emailService.SendTicketEmail(email.TicketEmailData{
		UserEmail:     userEmail,
		UserName:      userName,
		EventTitle:    eventTitle,
		TicketIDs:     fmt.Sprintf("%d", ticketID),
		TicketTypes:   categoryName,
		SeatCodes:     seatCode,
		VenueName:     finalVenueName,
		VenueAddress:  finalVenueAddress,
		AreaName:      finalAreaName,
		MapURL:        mapURL,
		TotalAmount:   formattedAmount,
		StartTime:     startTime.Format("15:04 02/01/2006"),
		PaymentMethod: "VNPAY",
		QRCodeBase64:  qrBase64, // ✅ Base64 từ database
		PDFAttachment: pdfBytes, // ✅ Attach PDF
		PDFFilename:   pdfFilename,
	})
	if err != nil {
		log.Error("Failed to send ticket email", "user_email", userEmail, "error", err)
	} else {
		log.Info("Ticket email sent successfully", "user_email", userEmail, "ticket_id", ticketID)
	}
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
		"SELECT email, full_name FROM Users WHERE user_id = ?",
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
		 WHERE e.event_id = ?`,
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
			"SELECT COALESCE(full_name, 'Event Organizer'), COALESCE(email, '') FROM Users WHERE user_id = ?",
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

	// Phase 6: Dual path - Notification API or local PDF+email
	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		// Gather ticket data for API call
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
				 WHERE t.ticket_id = ?`,
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

		if err := sendMultipleTicketsViaNotifyAPI(bgCtx, map[string]interface{}{
			"user_email":      userEmail,
			"user_name":       userName,
			"event_title":     eventTitle,
			"start_time":      startTime.Format(time.RFC3339),
			"end_time":        endTime.Format(time.RFC3339),
			"venue_name":      finalVenueName,
			"area_name":       finalAreaName,
			"venue_address":   finalVenueAddress,
			"total_amount":    formatCurrency(totalAmount),
			"map_url":         mapURL,
			"organizer_name":  organizerName,
			"organizer_email": organizerEmail,
			"items":           items,
		}); err != nil {
			log.Warn("Notification API failed for multiple tickets, falling back to local", "error", err)
		} else {
			log.Info("Multiple tickets email sent via Notification API", "ticket_count", len(ticketIDs))
			return
		}
	}

	// Legacy path: Generate PDF locally + send email directly
	// Generate PDF cho MỖI vé
	pdfAttachments := []email.PDFAttachment{}
	seatCodes := []string{}

	for _, ticketID := range ticketIDs {
		// Lấy thông tin ticket
		var qrBase64 string
		var seatCode string
		var ticketCategoryName string
		var price float64
		err = r.db.QueryRowContext(bgCtx,
			`SELECT t.qr_code_value, s.seat_code, COALESCE(ct.name, 'Vé'), COALESCE(ct.price, 0)
			 FROM Ticket t
			 JOIN Seat s ON t.seat_id = s.seat_id
			 LEFT JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			 WHERE t.ticket_id = ?`,
			ticketID,
		).Scan(&qrBase64, &seatCode, &ticketCategoryName, &price)
		if err != nil {
			log.Error("Failed to get ticket", "ticket_id", ticketID, "error", err)
			continue
		}

		seatCodes = append(seatCodes, seatCode)

		// Parse seat code (A5 -> row="A", number="5")
		seatRow := ""
		seatNumber := ""
		if len(seatCode) > 0 {
			for i, c := range seatCode {
				if c >= '0' && c <= '9' {
					seatRow = seatCode[:i]
					seatNumber = seatCode[i:]
					break
				}
			}
			if seatRow == "" {
				seatRow = seatCode
				seatNumber = "1"
			}
		}

		// Generate QR PNG bytes
		var qrPngBytes []byte
		if qrBase64 != "" && !strings.HasPrefix(qrBase64, "PENDING_QR") {
			qrPngBytes, err = parseBase64ToPNG(qrBase64)
			if err != nil {
				log.Warn("Failed to decode QR Base64", "ticket_id", ticketID, "error", err)
				continue
			}
		}

		// Generate PDF
		if qrPngBytes != nil && len(qrPngBytes) > 0 {
			pdfBytes, err := ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
				TicketCode:   fmt.Sprintf("TKT_%d", ticketID),
				EventName:    eventTitle,
				EventDate:    startTime,
				VenueName:    finalVenueName,
				AreaName:     finalAreaName,
				Address:      finalVenueAddress,
				SeatRow:      seatRow,
				SeatNumber:   seatNumber,
				CategoryName: ticketCategoryName,
				// ⭐ FIX: Format float64 price as integer VND
				Price:          formatCurrency(fmt.Sprintf("%.0f", price)),
				UserName:       userName,
				UserEmail:      userEmail,
				QRCodePngBytes: qrPngBytes,
			})
			if err != nil {
				log.Error("Failed to generate PDF", "ticket_id", ticketID, "error", err)
				continue
			}

			pdfAttachments = append(pdfAttachments, email.PDFAttachment{
				Filename: fmt.Sprintf("ticket_%d_%s.pdf", ticketID, seatCode),
				Data:     pdfBytes,
			})
			log.Info("PDF generated", "ticket_id", ticketID, "size_bytes", len(pdfBytes))
		}
	}

	if len(pdfAttachments) == 0 {
		log.Error("No PDFs generated - cannot send email")
		return
	}

	// Gửi 1 email với TẤT CẢ PDF attachments
	emailService := email.NewEmailService(nil)

	// Format seat list cho email body
	seatListStr := strings.Join(seatCodes, ", ")

	err = emailService.SendMultipleTicketsEmail(email.MultipleTicketsEmailData{
		UserEmail:      userEmail,
		UserName:       userName,
		EventTitle:     eventTitle,
		EventDate:      startTime.Format("Monday, January 02, 2006 at 03:04 PM"),
		VenueName:      finalVenueName,
		VenueAddress:   finalVenueAddress,
		TicketCount:    len(ticketIDs),
		SeatList:       seatListStr,
		TotalAmount:    formatCurrency(totalAmount),
		GoogleMapsURL:  mapURL,
		PDFAttachments: pdfAttachments,
	})

	if err != nil {
		log.Error("Failed to send multiple tickets email", "user_email", userEmail, "ticket_count", len(ticketIDs), "error", err)
	} else {
		fmt.Printf("[NOTIFY] ✅ Email sent successfully → %s (%d tickets)\n", userEmail, len(ticketIDs))
		log.Info("[NOTIFY] ✅ Multiple tickets email sent successfully", "user_email", userEmail, "ticket_count", len(ticketIDs))
	}
}

// parseBase64ToPNG converts base64 string to PNG bytes
// Handles both "data:image/png;base64,..." and plain base64 formats
func parseBase64ToPNG(qrBase64 string) ([]byte, error) {
	// Remove data URI prefix if present
	base64Str := qrBase64
	if strings.HasPrefix(qrBase64, "data:image/png;base64,") {
		base64Str = strings.TrimPrefix(qrBase64, "data:image/png;base64,")
	}

	// Decode base64 to bytes
	return base64.StdEncoding.DecodeString(base64Str)
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
	query := `SELECT COALESCE(balance, 0) FROM Wallet WHERE user_id = ?`

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
		placeholders[i] = "?"
		args[i+1] = seatID
	}

	query := fmt.Sprintf(`
		SELECT COALESCE(SUM(ct.price), 0) as total
		FROM Seat s
		JOIN Category_Ticket ct ON s.category_ticket_id = ct.category_ticket_id
		WHERE ct.event_id = ? AND s.seat_id IN (%s)
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
	// ===== VALIDATION: CHECK EVENT STATUS BEFORE TRANSACTION =====
	// Prevent booking on closed/cancelled events
	var eventStatus string
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, "SELECT status, start_time FROM Event WHERE event_id = ?", eventID).Scan(&eventStatus, &startTime)
	if err != nil {
		return "", fmt.Errorf("event not found")
	}

	// Event phải ở trạng thái OPEN để có thể mua vé
	if eventStatus != "OPEN" {
		fmt.Printf("[SECURITY] Cảnh báo: User %d cố tình đặt vé cho sự kiện CLOSED (ID: %d), status=%s\n", userID, eventID, eventStatus)
		return "", fmt.Errorf("Sự kiện đã kết thúc hoặc đã đóng, không thể đặt thêm ghế")
	}

	// ⭐ SECURITY: Kiểm tra xem event đã bắt đầu chưa
	// Nếu thời gian hiện tại >= start_time: từ chối đặt vé
	now := time.Now()
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
	lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = ? FOR UPDATE`
	err = tx.QueryRowContext(ctx, lockQuery, userID).Scan(&walletID, &currentBalance)
	if err != nil {
		if err == sql.ErrNoRows {
			// Auto-create wallet with balance 0 (Auth Service manages Users.Wallet via API)
			insertResult, insertErr := tx.ExecContext(ctx,
				"INSERT INTO Wallet (user_id, balance, currency, status) VALUES (?, 0, 'VND', 'ACTIVE')", userID)
			if insertErr != nil {
				return "", fmt.Errorf("error creating wallet: %w", insertErr)
			}
			id, _ := insertResult.LastInsertId()
			walletID = int(id)
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

		// Create ticket in database with PENDING_QR (will update after getting ticketID)
		insertTicketQuery := `
			INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at)
			VALUES (?, ?, ?, ?, 'PENDING_QR', 'BOOKED', NOW())
		`

		result, err := tx.ExecContext(ctx, insertTicketQuery, userID, eventID, categoryTicketID, seatID)
		if err != nil {
			fmt.Printf("[SQL_FIX] ❌ Error creating ticket: %v\n", err)
			return "", fmt.Errorf("error creating ticket: %w", err)
		}

		ticketID, err := result.LastInsertId()
		if err != nil {
			return "", fmt.Errorf("error getting ticket ID: %w", err)
		}

		// Generate QR code Base64 from ticketID (same as VNPAY)
		qrBase64, err := qrcode.GenerateTicketQRBase64(int(ticketID), 300)
		if err != nil {
			fmt.Printf("[QR_FIX] ⚠️ Failed to generate QR for Ticket ID: %d, error: %v\n", ticketID, err)
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
		}

		// Update ticket with real QR code
		updateQRQuery := `UPDATE Ticket SET qr_code_value = ? WHERE ticket_id = ?`
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
			WHERE t.ticket_id = ?
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
			"SELECT COALESCE(full_name, 'Event Organizer'), COALESCE(email, '') FROM Users WHERE user_id = ?",
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
	updateWalletQuery := `UPDATE Wallet SET balance = ? WHERE wallet_id = ? AND balance >= ?`
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

	// Log transaction in Wallet_Transaction table
	_, txErr := tx.ExecContext(ctx,
		`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES (?, ?, 'DEBIT', ?, ?, ?, 'TICKET_PURCHASE', ?, ?)`,
		walletID, userID, float64(amount), currentBalance, newBalance,
		fmt.Sprintf("tickets:%s", strings.Join(ticketIds, ",")),
		fmt.Sprintf("Mua vé event %d", eventID),
	)
	if txErr != nil {
		fmt.Printf("[WALLET_TX] ⚠️ Failed to log Wallet_Transaction: %v\n", txErr)
	}

	// ===== STEP 3.5: CREATE BILL =====
	// Create bill record for this wallet payment within the same transaction
	billResult, err := tx.ExecContext(ctx,
		"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES (?, ?, 'VND', 'Wallet', 'PAID', NOW(), NOW())",
		userID, float64(amount),
	)
	if err != nil {
		return "", fmt.Errorf("error creating bill: %w", err)
	}

	billID, err := billResult.LastInsertId()
	if err != nil {
		return "", fmt.Errorf("error getting bill ID: %w", err)
	}

	fmt.Printf("[BILL_CREATED] ✅ Da xuat hoa don ID: %d cho phuong thuc: %s\n", billID, "Wallet")

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
				"start_time":      startTime.Format(time.RFC3339),
				"end_time":        endTime.Format(time.RFC3339),
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
				fmt.Printf("[WARN] Notification API failed for single ticket, falling back to local: %v\n", err)
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
				"start_time":      startTime.Format(time.RFC3339),
				"end_time":        endTime.Format(time.RFC3339),
				"venue_name":      venueName,
				"area_name":       areaNames[0],
				"venue_address":   venueAddress,
				"total_amount":    fmt.Sprintf("%.0f", totalPrice),
				"map_url":         fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(venueAddress)),
				"organizer_name":  organizerName,
				"organizer_email": organizerEmail,
				"items":           items,
			}); err != nil {
				fmt.Printf("[WARN] Notification API failed for multiple tickets, falling back to local: %v\n", err)
			} else {
				fmt.Printf("[NOTIFY_API] ✅ Multiple tickets email sent via Notification API\n")
				fmt.Printf("[DEBUG] ProcessWalletPayment: COMPLETED for userID=%d with %d tickets\n", userID, len(ticketIds))
				return strings.Join(ticketIds, ","), nil
			}
		}
	}

	// Legacy path (local PDF gen + email): STEP 4.5 GENERATE PDF + STEP 5 SEND EMAIL
	// Generate PDF for each ticket to attach to email
	pdfAttachments := []email.PDFAttachment{}

	for i, ticketIDStr := range ticketIds {
		// Convert ticket ID to int
		ticketID, _ := strconv.Atoi(ticketIDStr)

		// Parse QR Base64 to PNG bytes (qrValues now contains Base64 strings)
		qrPngBytes, err := parseBase64ToPNG(qrValues[i])
		if err != nil {
			fmt.Printf("[PDF_WARN] Failed to parse QR Base64 for ticketID=%d: %v\n", ticketID, err)
			continue
		}

		// Parse seat code to extract row and number (format: "A1", "B12", etc.)
		seatRow := ""
		seatNumber := ""
		seatCodeStr := seatCodes[i]
		if len(seatCodeStr) > 0 {
			// Try to split seat code into row (letters) and number (digits)
			for idx, char := range seatCodeStr {
				if char >= '0' && char <= '9' {
					seatRow = seatCodeStr[:idx]
					seatNumber = seatCodeStr[idx:]
					break
				}
			}
			if seatRow == "" {
				seatRow = seatCodeStr
				seatNumber = "1"
			}
		}

		// Generate PDF ticket
		pdfBytes, err := ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
			TicketCode:     fmt.Sprintf("TKT_%d", ticketID),
			EventName:      eventTitle,
			EventDate:      startTime,
			VenueName:      venueName,
			AreaName:       areaNames[i],
			Address:        venueAddress,
			SeatRow:        seatRow,
			SeatNumber:     seatNumber,
			CategoryName:   categoryNames[i],
			Price:          formatCurrency(fmt.Sprintf("%.0f", prices[i])),
			UserName:       userName,
			UserEmail:      userEmail,
			QRCodePngBytes: qrPngBytes,
		})
		if err != nil {
			fmt.Printf("[PDF_WARN] Failed to generate PDF for ticketID=%d: %v\n", ticketID, err)
			continue
		}

		pdfAttachments = append(pdfAttachments, email.PDFAttachment{
			Filename: fmt.Sprintf("ticket_%d_%s.pdf", ticketID, seatCodeStr),
			Data:     pdfBytes,
		})
		fmt.Printf("[PDF_SUCCESS] Generated PDF for ticketID=%d, size=%d bytes\n", ticketID, len(pdfBytes))
	}

	fmt.Printf("[PDF_ATTACHMENT] Đã tạo %d file PDF cho User: %d\n", len(pdfAttachments), userID)

	// ===== STEP 5: SEND EMAIL NOTIFICATIONS =====
	// Done outside transaction to avoid blocking other operations
	// If email fails, tickets are already created and balance already deducted
	if len(ticketIds) > 0 {
		emailService := email.NewEmailService(nil)

		// Prepare email data based on number of tickets
		if len(ticketIds) == 1 {
			emailData := email.TicketEmailData{
				UserEmail:     userEmail,
				UserName:      userName,
				EventTitle:    eventTitle,
				TicketIDs:     ticketIds[0],
				TicketTypes:   ticketTypes[0],
				SeatCodes:     seatCodes[0],
				VenueName:     venueName,
				VenueAddress:  venueAddress,
				TotalAmount:   fmt.Sprintf("%.0f", totalPrice),
				StartTime:     startTime.Format("2006-01-02 15:04"),
				PaymentMethod: "wallet",
				MapURL:        fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(venueAddress)),
			}
			// Add PDF attachment if generated
			if len(pdfAttachments) > 0 {
				emailData.PDFAttachment = pdfAttachments[0].Data
				emailData.PDFFilename = pdfAttachments[0].Filename
				fmt.Printf("[EMAIL] Sending single ticket email with PDF: %s\n", pdfAttachments[0].Filename)
			}
			if err := emailService.SendTicketEmail(emailData); err != nil {
				fmt.Printf("[WARN] Failed to send ticket email: %v\n", err)
				// Continue anyway - tickets are already created
			}
		} else {
			seatList := strings.Join(seatCodes, ", ")
			emailData := email.MultipleTicketsEmailData{
				UserEmail:     userEmail,
				UserName:      userName,
				EventTitle:    eventTitle,
				EventDate:     startTime.Format("2006-01-02 15:04"),
				VenueName:     venueName,
				VenueAddress:  venueAddress,
				TicketCount:   len(ticketIds),
				SeatList:      seatList,
				TotalAmount:   fmt.Sprintf("%.0f", totalPrice),
				GoogleMapsURL: fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(venueAddress)),
			}
			// Add PDF attachments if generated
			if len(pdfAttachments) > 0 {
				emailData.PDFAttachments = pdfAttachments
				fmt.Printf("[EMAIL] Sending multiple tickets email with %d PDFs\n", len(pdfAttachments))
			}
			if err := emailService.SendMultipleTicketsEmail(emailData); err != nil {
				fmt.Printf("[WARN] Failed to send multiple tickets email: %v\n", err)
				// Continue anyway - tickets are already created
			}
		}
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

// sendSingleTicketViaNotifyAPI sends single ticket email via Notification Service API.
// Payload must match SingleTicketData in notification handler (camelCase JSON).
func sendSingleTicketViaNotifyAPI(ctx context.Context, data map[string]interface{}) error {
	log := logger.Default()
	client := utils.NewInternalClient()
	// Gọi endpoint /ticket-confirmation (alias của /ticket-pdf nhận đúng DTO)
	notifyURL := utils.GetNotificationServiceURL() + "/internal/notify/ticket-confirmation"

	// Lấy các giá trị cần thiết từ snake_case map
	ticketID, _ := data["ticket_id"].(int)
	seatRow, _ := data["seat_row"].(string)
	seatNumber, _ := data["seat_number"].(string)
	categoryName, _ := data["category_name"].(string)
	startTime, _ := data["start_time"].(string)
	userEmail, _ := data["user_email"].(string)

	fmt.Printf("[NOTIFY] 📧 Đang gửi vé #%d tới email %s...\n", ticketID, userEmail)

	// Chuyển đổi sang camelCase DTO theo SingleTicketData của notification handler
	payload := map[string]interface{}{
		"singleTicket": map[string]interface{}{
			"ticketId":       ticketID,
			"ticketCode":     fmt.Sprintf("TKT_%d", ticketID),
			"userEmail":      userEmail,
			"userName":       data["user_name"],
			"eventTitle":     data["event_title"],
			"eventDate":      startTime,
			"endTime":        data["end_time"],
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
	// Gọi endpoint /ticket-confirmation (alias của /ticket-pdf nhận đúng DTO)
	notifyURL := utils.GetNotificationServiceURL() + "/internal/notify/ticket-confirmation"

	userEmail, _ := data["user_email"].(string)
	userName, _ := data["user_name"].(string)
	eventAreaName, _ := data["area_name"].(string)

	// Chuyển đổi items → TicketPDFItem camelCase
	rawItems, _ := data["items"].([]map[string]interface{})
	ticketItems := []map[string]interface{}{}
	seatCodeList := []string{}
	for _, item := range rawItems {
		ticketID, _ := item["ticket_id"].(int)
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
			"eventDate":    data["start_time"],
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
		"multipleTickets": map[string]interface{}{
			"userEmail":      userEmail,
			"userName":       userName,
			"eventTitle":     data["event_title"],
			"eventDate":      data["start_time"],
			"endTime":        data["end_time"],
			"venueName":      data["venue_name"],
			"venueAddress":   data["venue_address"],
			"seatList":       seatList,
			"totalAmount":    data["total_amount"],
			"googleMapsUrl":  data["map_url"],
			"organizerName":  data["organizer_name"],
			"organizerEmail": data["organizer_email"],
			"tickets":        ticketItems,
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
