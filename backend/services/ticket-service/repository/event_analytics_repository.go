package repository

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/fpt-event-services/common/policy"
	"github.com/fpt-event-services/services/ticket-service/models"
)

var (
	ErrEventNotFound  = errors.New("sự kiện không tồn tại")
	ErrEventForbidden = errors.New("bạn không có quyền truy cập thông tin sự kiện này")
	ErrUserNotFound   = errors.New("người dùng không tồn tại")
	ErrFailClosed503  = errors.New("FAIL_CLOSED_503")
)

// ErrPaywallRequired - Lỗi chặn truy cập báo cáo nâng cao khi chưa mua gói
type ErrPaywallRequired struct {
	CurrentTier string `json:"currentTier"`
	Message     string `json:"message"`
}

func (e *ErrPaywallRequired) Error() string {
	return e.Message
}

// verifyEventAccess kiểm tra quyền truy cập sự kiện (ADMIN hoặc chủ sự kiện ORGANIZER/SCHOOL_ORGANIZER đọc từ DB)
func (r *TicketRepository) verifyEventAccess(ctx context.Context, eventID int, userID int) (string, bool, time.Time, string, int, string, error) {
	if userID <= 0 {
		return "", false, time.Time{}, "", 0, "", fmt.Errorf("%w: thiếu thông tin xác thực người dùng", ErrEventForbidden)
	}

	var userRole string
	err := r.db.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1", userID).Scan(&userRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, time.Time{}, "", 0, "", fmt.Errorf("%w: user_id=%d", ErrUserNotFound, userID)
		}
		return "", false, time.Time{}, "", 0, "", fmt.Errorf("%w: lỗi đọc role người dùng: %v", ErrFailClosed503, err)
	}

	if userRole != "ADMIN" && userRole != "ORGANIZER" && userRole != "SCHOOL_ORGANIZER" {
		return "", false, time.Time{}, userRole, 0, "", fmt.Errorf("%w: chỉ Quản trị viên hoặc Người tổ chức mới có quyền truy cập", ErrEventForbidden)
	}

	var ownerID int
	var title string
	var isSettled bool
	var createdAt time.Time
	var ownerName sql.NullString
	err = r.db.QueryRowContext(ctx, `
		SELECT e.created_by, e.title, e.is_settled, e.created_at, u.full_name
		FROM event e
		LEFT JOIN users u ON e.created_by = u.user_id
		WHERE e.event_id = $1
	`, eventID).Scan(&ownerID, &title, &isSettled, &createdAt, &ownerName)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, time.Time{}, userRole, 0, "", fmt.Errorf("%w: event_id=%d", ErrEventNotFound, eventID)
		}
		return "", false, time.Time{}, userRole, 0, "", fmt.Errorf("%w: lỗi đọc thông tin sự kiện: %v", ErrFailClosed503, err)
	}

	if userRole != "ADMIN" && ownerID != userID {
		return "", false, time.Time{}, userRole, 0, "", fmt.Errorf("%w: sự kiện không thuộc quyền sở hữu của user_id=%d", ErrEventForbidden, userID)
	}

	orgName := ""
	if ownerName.Valid && ownerName.String != "" {
		orgName = ownerName.String
	} else if ownerID > 0 {
		orgName = fmt.Sprintf("Organizer #%d", ownerID)
	}

	return title, isSettled, createdAt, userRole, ownerID, orgName, nil
}

// GetEventFinancialOverview - Báo cáo tài chính cơ bản 3 cột tiền từ snapshot financial_receipt (Pha 5)
// 1. Số tiền thanh toán (gross), phí hoa hồng (commission_amount, ĐÃ gồm fixed_fee, không cộng lại), thực nhận (net)
// 2. Chỉ tính biên lai của bill PAID hoặc REFUNDED (cộng biên lai bill_id NULL); bill PENDING, FAILED bị loại
// 3. Số vé đã bán đếm từ bảng ticket (chỉ đếm BOOKED, CHECKED_IN, CHECKED_OUT; trừ EXPIRED, PENDING, REFUNDED; gồm cả vé miễn phí 0đ)
// 4. Số vé hoàn (TotalTicketsRefunded) đếm trực tiếp từ bảng ticket (status = 'REFUNDED')
func (r *TicketRepository) GetEventFinancialOverview(ctx context.Context, eventID int, userID int) (*models.EventFinancialOverview, error) {
	title, isSettled, createdAt, _, ownerID, ownerName, err := r.verifyEventAccess(ctx, eventID, userID)
	if err != nil {
		return nil, err
	}

	// 1. Doanh thu từ financial_receipt (Chỉ tính bill PAID hoặc REFUNDED + biên lai bill_id NULL; loại bỏ PENDING, FAILED)
	overviewQuery := `
		SELECT 
			COALESCE(SUM(fr.gross_amount), 0)::BIGINT AS total_gross,
			COALESCE(SUM(fr.commission_amount), 0)::BIGINT AS total_platform_fee,
			COALESCE(SUM(fr.net_amount), 0)::BIGINT AS total_net
		FROM financial_receipt fr
		LEFT JOIN bill b ON fr.bill_id = b.bill_id
		WHERE fr.event_id = $1
		  AND (fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED'))
	`
	var gross, platformFee, net int64
	err = r.db.QueryRowContext(ctx, overviewQuery, eventID).Scan(&gross, &platformFee, &net)
	if err != nil {
		return nil, fmt.Errorf("lỗi tổng hợp doanh thu tài chính: %w", err)
	}

	// 2. Số vé đã bán đếm từ bảng ticket (dùng chung tập trạng thái BOOKED, CHECKED_IN, CHECKED_OUT)
	var ticketsSold int
	ticketCountQuery := `
		SELECT COUNT(*) 
		FROM ticket 
		WHERE event_id = $1 
		  AND status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
	`
	err = r.db.QueryRowContext(ctx, ticketCountQuery, eventID).Scan(&ticketsSold)
	if err != nil {
		return nil, fmt.Errorf("lỗi đếm số vé đã bán từ bảng ticket: %w", err)
	}

	// 3. Số vé hoàn đếm từ bảng ticket (status = 'REFUNDED')
	var refundedCount int
	refundCountQuery := `
		SELECT COUNT(*)
		FROM ticket
		WHERE event_id = $1
		  AND status = 'REFUNDED'
	`
	err = r.db.QueryRowContext(ctx, refundCountQuery, eventID).Scan(&refundedCount)
	if err != nil {
		return nil, fmt.Errorf("lỗi đếm số vé hoàn từ bảng ticket: %w", err)
	}

	return &models.EventFinancialOverview{
		EventID:                   eventID,
		Title:                     title,
		OrganizerID:               ownerID,
		OrganizerName:             ownerName,
		TotalGrossRevenue:         gross,
		TotalGrossFormatted:       models.FormatCurrencyVND(gross),
		TotalPlatformFee:          platformFee,
		TotalPlatformFeeFormatted: models.FormatCurrencyVND(platformFee),
		TotalNetProfit:            net,
		TotalNetFormatted:         models.FormatCurrencyVND(net),
		TotalTicketsSold:          ticketsSold,
		TotalTicketsRefunded:      refundedCount,
		Currency:                  "VND",
		IsSettled:                 isSettled,
		CreatedAt:                 createdAt,
	}, nil
}

// GetEventCheckInList - Danh sách check-in và người tham dự thời gian thực (Pha 5)
// Mở cho mọi Organizer (kể cả Free/Pro/Business/School Organizer) và ADMIN
func (r *TicketRepository) GetEventCheckInList(ctx context.Context, eventID int, userID int) ([]models.EventCheckInItem, error) {
	_, _, _, _, _, _, err := r.verifyEventAccess(ctx, eventID, userID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT 
			t.ticket_id,
			COALESCE(t.qr_code_value, '') AS raw_ticket_code,
			COALESCE(t.category_ticket_id, 0) AS category_ticket_id,
			COALESCE(ct.name, '') AS category_name,
			COALESCE(ct.price, 0)::BIGINT AS price_vnd,
			t.user_id,
			COALESCE(u.full_name, '') AS attendee_name,
			COALESCE(u.email, '') AS attendee_email,
			COALESCE(s.seat_code, '') AS seat_code,
			t.status,
			t.checkin_time,
			t.check_out_time,
			t.created_at
		FROM ticket t
		LEFT JOIN category_ticket ct ON t.category_ticket_id = ct.category_ticket_id
		LEFT JOIN users u ON t.user_id = u.user_id
		LEFT JOIN seat s ON t.seat_id = s.seat_id
		WHERE t.event_id = $1
		  AND t.status != 'PENDING'
		ORDER BY t.checkin_time DESC NULLS LAST, t.ticket_id ASC
	`
	rows, err := r.db.QueryContext(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn danh sách check-in: %w", err)
	}
	defer rows.Close()

	var items []models.EventCheckInItem
	for rows.Next() {
		var item models.EventCheckInItem
		var rawCode string
		var checkedIn, checkedOut sql.NullTime
		if err := rows.Scan(
			&item.TicketID,
			&rawCode,
			&item.CategoryTicketID,
			&item.CategoryName,
			&item.PriceVND,
			&item.UserID,
			&item.AttendeeName,
			&item.AttendeeEmail,
			&item.SeatCode,
			&item.Status,
			&checkedIn,
			&checkedOut,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("lỗi đọc bản ghi vé check-in: %w", err)
		}
		item.TicketCode = models.MaskTicketCode(rawCode)
		item.PriceFormatted = models.FormatCurrencyVND(item.PriceVND)
		if checkedIn.Valid {
			item.CheckedInAt = &checkedIn.Time
		}
		if checkedOut.Valid {
			item.CheckedOutAt = &checkedOut.Time
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi trong quá trình duyệt danh sách check-in: %w", err)
	}

	return items, nil
}

// GetEventSeatStatus - Trạng thái chỗ ngồi và đăng ký theo thời gian thực (Pha 5)
// Mở cho mọi Organizer (kể cả Free/Pro/Business/School Organizer) và ADMIN
func (r *TicketRepository) GetEventSeatStatus(ctx context.Context, eventID int, userID int) (*models.EventRealtimeSeatStatusResponse, error) {
	title, _, _, _, _, _, err := r.verifyEventAccess(ctx, eventID, userID)
	if err != nil {
		return nil, err
	}

	catQuery := `
		SELECT 
			ct.category_ticket_id,
			ct.name,
			ct.price::BIGINT,
			COALESCE(ct.max_quantity, 0) AS total_capacity,
			COALESCE(COUNT(t.ticket_id) FILTER (WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')), 0) AS sold_seats,
			COALESCE(COUNT(t.ticket_id) FILTER (WHERE t.status = 'CHECKED_IN' OR (t.checkin_time IS NOT NULL AND t.check_out_time IS NULL)), 0) AS checked_in_seats,
			COALESCE(COUNT(t.ticket_id) FILTER (WHERE t.status = 'CHECKED_OUT' OR t.check_out_time IS NOT NULL), 0) AS checked_out_seats
		FROM category_ticket ct
		LEFT JOIN ticket t ON ct.category_ticket_id = t.category_ticket_id
		WHERE ct.event_id = $1
		GROUP BY ct.category_ticket_id, ct.name, ct.price, ct.max_quantity
		ORDER BY ct.price DESC
	`
	rows, err := r.db.QueryContext(ctx, catQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc trạng thái loại vé và ghế: %w", err)
	}
	defer rows.Close()

	var categories []models.EventCategorySeatStatus
	totalCap, totalSold, totalRem, totalCheckedIn, totalCheckedOut := 0, 0, 0, 0, 0

	for rows.Next() {
		var cs models.EventCategorySeatStatus
		if err := rows.Scan(
			&cs.CategoryTicketID,
			&cs.CategoryName,
			&cs.Price,
			&cs.TotalCapacity,
			&cs.SoldSeats,
			&cs.CheckedInSeats,
			&cs.CheckedOutSeats,
		); err != nil {
			return nil, fmt.Errorf("lỗi scan trạng thái loại vé: %w", err)
		}
		cs.PriceFormatted = models.FormatCurrencyVND(cs.Price)
		cs.RemainingSeats = cs.TotalCapacity - cs.SoldSeats
		if cs.RemainingSeats < 0 {
			cs.RemainingSeats = 0
		}
		if cs.TotalCapacity > 0 {
			cs.FillRatePercent = math.Round((float64(cs.SoldSeats)/float64(cs.TotalCapacity))*10000) / 100
		}

		totalCap += cs.TotalCapacity
		totalSold += cs.SoldSeats
		totalRem += cs.RemainingSeats
		totalCheckedIn += cs.CheckedInSeats
		totalCheckedOut += cs.CheckedOutSeats

		categories = append(categories, cs)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi trong quá trình duyệt danh sách trạng thái ghế: %w", err)
	}

	return &models.EventRealtimeSeatStatusResponse{
		EventID:         eventID,
		Title:           title,
		TotalCapacity:   totalCap,
		TotalSold:       totalSold,
		TotalRemaining:  totalRem,
		TotalCheckedIn:  totalCheckedIn,
		TotalCheckedOut: totalCheckedOut,
		Categories:      categories,
	}, nil
}

// GetEventAdvancedAnalytics - Báo cáo nâng cao sự kiện với cơ chế chặn Paywall FAIL-CLOSED (Pha 6)
func (r *TicketRepository) GetEventAdvancedAnalytics(ctx context.Context, eventID int, userID int) (*models.EventAdvancedAnalyticsResponse, error) {
	// 1. Kiểm tra quyền sở hữu sự kiện và role DB (verifyEventAccess)
	title, _, _, dbRole, _, _, err := r.verifyEventAccess(ctx, eventID, userID)
	if err != nil {
		// BẢO MẬT PHÂN QUYỀN PHA 6:
		// Người không phải chủ sự kiện (và không phải ADMIN) luôn nhận HTTP 403 Forbidden (chống dò ID 404 vs 403)
		if dbRole != "ADMIN" && errors.Is(err, ErrEventNotFound) {
			return nil, fmt.Errorf("%w: sự kiện không thuộc quyền sở hữu của user_id=%d", ErrEventForbidden, userID)
		}
		return nil, err
	}

	// 2. Quyền xem báo cáo nâng cao (ADMIN luôn xem được; Organizer/School Organizer dùng policy.ResolveOrganizerPolicy)
	if dbRole != "ADMIN" {
		pol, errPol := policy.ResolveOrganizerPolicy(ctx, r.db, userID)
		if errPol != nil {
			return nil, fmt.Errorf("%w: lỗi phân giải chính sách tài khoản (fail-closed): %v", ErrFailClosed503, errPol)
		}
		if pol == nil || !pol.HasAdvancedReports {
			tierCode := "FREE"
			if pol != nil && pol.TierCode != "" {
				tierCode = pol.TierCode
			}
			return nil, &ErrPaywallRequired{
				CurrentTier: tierCode,
				Message:     "Báo cáo nâng cao chỉ mở khóa cho gói dịch vụ Pro, Business hoặc Cán bộ cấp Trường (School Organizer).",
			}
		}
	}

	// 4. Doanh thu tổng hợp từ financial_receipt (chỉ bill PAID, REFUNDED hoặc NULL; gồm biên lai đảo)
	overviewQuery := `
		SELECT 
			COALESCE(SUM(fr.gross_amount), 0)::BIGINT AS total_gross,
			COALESCE(SUM(fr.commission_amount), 0)::BIGINT AS total_platform_fee,
			COALESCE(SUM(fr.net_amount), 0)::BIGINT AS total_net
		FROM financial_receipt fr
		LEFT JOIN bill b ON fr.bill_id = b.bill_id
		WHERE fr.event_id = $1
		  AND (fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED'))
	`
	var gross, platformFee, net int64
	err = r.db.QueryRowContext(ctx, overviewQuery, eventID).Scan(&gross, &platformFee, &net)
	if err != nil {
		return nil, fmt.Errorf("lỗi tổng hợp doanh thu tài chính: %w", err)
	}

	// 5. Số vé đã bán đếm từ bảng ticket (dùng cùng tập trạng thái 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
	var ticketsSold int
	ticketCountQuery := `
		SELECT COUNT(*) 
		FROM ticket 
		WHERE event_id = $1 
		  AND status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
	`
	err = r.db.QueryRowContext(ctx, ticketCountQuery, eventID).Scan(&ticketsSold)
	if err != nil {
		return nil, fmt.Errorf("lỗi đếm số vé đã bán: %w", err)
	}

	// 6. Số vé đã check-in ('CHECKED_IN', 'CHECKED_OUT')
	var checkedInCount int
	checkedInQuery := `
		SELECT COUNT(*) 
		FROM ticket 
		WHERE event_id = $1 
		  AND status IN ('CHECKED_IN', 'CHECKED_OUT')
	`
	err = r.db.QueryRowContext(ctx, checkedInQuery, eventID).Scan(&checkedInCount)
	if err != nil {
		return nil, fmt.Errorf("lỗi đếm số vé check-in: %w", err)
	}

	// 7. Tổng sức chứa (TotalCapacity) dùng hàm sức chứa hiệu dụng đã chốt ở Pha 2
	totalCapacity, err := policy.CalculateEffectiveCapacity(ctx, r.db, eventID, nil, 0)
	if err != nil {
		return nil, fmt.Errorf("lỗi tính toán sức chứa hiệu dụng: %w", err)
	}

	// 8. Thống kê theo loại vé (Category Breakdown - Động theo category_ticket của sự kiện)
	catQuery := `
		SELECT 
			ct.category_ticket_id,
			ct.name,
			ct.price::BIGINT,
			COALESCE(ct.max_quantity, 0) AS total_capacity,
			COALESCE(COUNT(DISTINCT t.ticket_id) FILTER (WHERE t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')), 0) AS sold_seats,
			COALESCE(COUNT(DISTINCT t.ticket_id) FILTER (WHERE t.status IN ('CHECKED_IN', 'CHECKED_OUT')), 0) AS checked_in_seats,
			COALESCE(SUM(fr.gross_amount) FILTER (WHERE fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED')), 0)::BIGINT AS cat_gross,
			COALESCE(SUM(fr.commission_amount) FILTER (WHERE fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED')), 0)::BIGINT AS cat_platform_fee,
			COALESCE(SUM(fr.net_amount) FILTER (WHERE fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED')), 0)::BIGINT AS cat_net
		FROM category_ticket ct
		LEFT JOIN ticket t ON ct.category_ticket_id = t.category_ticket_id
		LEFT JOIN financial_receipt fr ON t.ticket_id = fr.ticket_id
		LEFT JOIN bill b ON fr.bill_id = b.bill_id
		WHERE ct.event_id = $1
		GROUP BY ct.category_ticket_id, ct.name, ct.price, ct.max_quantity
		ORDER BY ct.price DESC, ct.category_ticket_id ASC
	`
	cRows, err := r.db.QueryContext(ctx, catQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc phân bổ loại vé: %w", err)
	}
	defer cRows.Close()

	categories := make([]models.CategorySalesBreakdown, 0)
	for cRows.Next() {
		var cb models.CategorySalesBreakdown
		if err := cRows.Scan(
			&cb.CategoryTicketID, &cb.CategoryName, &cb.Price,
			&cb.TotalCapacity, &cb.SoldSeats, &cb.CheckedInSeats,
			&cb.GrossRevenue, &cb.PlatformFee, &cb.NetProfit,
		); err != nil {
			return nil, fmt.Errorf("lỗi đọc bản ghi loại vé: %w", err)
		}
		cb.PriceFormatted = models.FormatCurrencyVND(cb.Price)
		cb.GrossFormatted = models.FormatCurrencyVND(cb.GrossRevenue)
		cb.NetFormatted = models.FormatCurrencyVND(cb.NetProfit)
		cb.RemainingSeats = cb.TotalCapacity - cb.SoldSeats
		if cb.RemainingSeats < 0 {
			cb.RemainingSeats = 0
		}
		if cb.TotalCapacity > 0 {
			cb.FillRatePercent = math.Round((float64(cb.SoldSeats)/float64(cb.TotalCapacity))*10000) / 100
		}
		categories = append(categories, cb)
	}
	if err := cRows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi trong vòng lặp phân bổ loại vé: %w", err)
	}

	// 9. Xu hướng bán vé theo thời gian (Daily Sales Timeline theo múi giờ Asia/Ho_Chi_Minh)
	timelineQuery := `
		SELECT 
			TO_CHAR(fr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
			COALESCE(COUNT(CASE WHEN fr.gross_amount >= 0 THEN 1 END) - COUNT(CASE WHEN fr.gross_amount < 0 THEN 1 END), 0) AS tickets_sold,
			COALESCE(SUM(fr.gross_amount), 0)::BIGINT AS daily_gross,
			COALESCE(SUM(fr.commission_amount), 0)::BIGINT AS daily_platform_fee,
			COALESCE(SUM(fr.net_amount), 0)::BIGINT AS daily_net
		FROM financial_receipt fr
		LEFT JOIN bill b ON fr.bill_id = b.bill_id
		WHERE fr.event_id = $1
		  AND (fr.bill_id IS NULL OR b.payment_status IN ('PAID', 'REFUNDED'))
		GROUP BY TO_CHAR(fr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
		ORDER BY day ASC
	`
	tRows, err := r.db.QueryContext(ctx, timelineQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc xu hướng bán vé: %w", err)
	}
	defer tRows.Close()

	timeline := make([]models.DailySalesPoint, 0)
	for tRows.Next() {
		var p models.DailySalesPoint
		if err := tRows.Scan(&p.Date, &p.TicketsSold, &p.GrossRevenue, &p.PlatformFee, &p.NetProfit); err != nil {
			return nil, fmt.Errorf("lỗi scan dòng xu hướng bán vé: %w", err)
		}
		p.GrossFormatted = models.FormatCurrencyVND(p.GrossRevenue)
		p.NetFormatted = models.FormatCurrencyVND(p.NetProfit)
		timeline = append(timeline, p)
	}
	if err := tRows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi trong vòng lặp xu hướng bán vé: %w", err)
	}

	// 10. Check-in theo khung giờ (Hourly Check-ins, 0 - 23h)
	hourlyMap := make(map[int]int)
	hourlyQuery := `
		SELECT 
			EXTRACT(HOUR FROM checkin_time)::INT AS hour_num,
			COUNT(*) AS count
		FROM ticket
		WHERE event_id = $1
		  AND checkin_time IS NOT NULL
		GROUP BY EXTRACT(HOUR FROM checkin_time)
	`
	hRows, err := r.db.QueryContext(ctx, hourlyQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc thống kê check-in theo khung giờ: %w", err)
	}
	defer hRows.Close()

	for hRows.Next() {
		var h, c int
		if err := hRows.Scan(&h, &c); err != nil {
			return nil, fmt.Errorf("lỗi scan dòng check-in theo khung giờ: %w", err)
		}
		hourlyMap[h] = c
	}
	if err := hRows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi trong vòng lặp check-in theo khung giờ: %w", err)
	}

	hourlyCheckIns := make([]models.HourlyCheckInPoint, 24)
	for h := 0; h < 24; h++ {
		hourlyCheckIns[h] = models.HourlyCheckInPoint{
			Hour:  h,
			Count: hourlyMap[h],
		}
	}

	// 11. Các tỷ lệ KPI tổng hợp
	checkInRate := 0.0
	if ticketsSold > 0 {
		checkInRate = math.Round((float64(checkedInCount)/float64(ticketsSold))*10000) / 100
	}
	var aov int64 = 0
	if ticketsSold > 0 {
		aov = gross / int64(ticketsSold)
	}
	fillRate := 0.0
	if totalCapacity > 0 {
		fillRate = math.Round((float64(ticketsSold)/float64(totalCapacity))*10000) / 100
	}

	return &models.EventAdvancedAnalyticsResponse{
		EventID:                   eventID,
		Title:                     title,
		TotalGrossRevenue:         gross,
		TotalGrossFormatted:       models.FormatCurrencyVND(gross),
		TotalPlatformFee:          platformFee,
		TotalPlatformFeeFormatted: models.FormatCurrencyVND(platformFee),
		TotalNetProfit:            net,
		TotalNetFormatted:         models.FormatCurrencyVND(net),
		TotalTicketsSold:          ticketsSold,
		CheckedInTickets:          checkedInCount,
		CheckInRatePercent:        checkInRate,
		AverageOrderValue:         aov,
		TotalCapacity:             totalCapacity,
		FillRatePercent:           fillRate,
		Timeline:                  timeline,
		CategoryBreakdown:         categories,
		HourlyCheckIns:            hourlyCheckIns,
		HasAdvancedReports:        true,
	}, nil
}

// GenerateEventCSVReport - Xuất CSV báo cáo dữ liệu của chính sự kiện với phòng chống CSV Injection
func (r *TicketRepository) GenerateEventCSVReport(ctx context.Context, eventID int, userID int) ([]byte, error) {
	analytics, err := r.GetEventAdvancedAnalytics(ctx, eventID, userID)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	// BOM tiếng Việt cho Excel
	buf.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(&buf)

	// Section 1: KPI Overview
	_ = writer.Write([]string{"DANH MỤC KPI", "GIÁ TRỊ"})
	_ = writer.Write([]string{"Mã Sự Kiện", fmt.Sprintf("%d", analytics.EventID)})
	_ = writer.Write([]string{"Tên Sự Kiện", models.EscapeCSVField(analytics.Title)})
	_ = writer.Write([]string{"Tổng Doanh Thu Thanh Toán (Gross - VNĐ)", fmt.Sprintf("%d", analytics.TotalGrossRevenue)})
	_ = writer.Write([]string{"Tổng Phí Sàn (Platform Fee - VNĐ)", fmt.Sprintf("%d", analytics.TotalPlatformFee)})
	_ = writer.Write([]string{"Tổng Doanh Thu Thực Nhận (Net - VNĐ)", fmt.Sprintf("%d", analytics.TotalNetProfit)})
	_ = writer.Write([]string{"Số Vé Đã Bán", fmt.Sprintf("%d", analytics.TotalTicketsSold)})
	_ = writer.Write([]string{"Lượt Check-in", fmt.Sprintf("%d", analytics.CheckedInTickets)})
	_ = writer.Write([]string{"Tỷ Lệ Check-in (%)", fmt.Sprintf("%.2f%%", analytics.CheckInRatePercent)})
	_ = writer.Write([]string{"Giá Trị Đơn Trung Bình (AOV - VNĐ)", fmt.Sprintf("%d", analytics.AverageOrderValue)})
	_ = writer.Write([]string{"Tổng Sức Chứa (Total Capacity)", fmt.Sprintf("%d", analytics.TotalCapacity)})
	_ = writer.Write([]string{"Tỷ Lệ Lấp Đầy (%)", fmt.Sprintf("%.2f%%", analytics.FillRatePercent)})
	_ = writer.Write([]string{""})

	// Section 2: Category Breakdown
	_ = writer.Write([]string{"Tên Loại Vé", "Giá Vé (VNĐ)", "Tổng Sức Chứa", "Số Vé Đã Bán", "Số Vé Còn Lại", "Số Vé Check-in", "Doanh Thu Gộp (VNĐ)", "Phí Sàn (VNĐ)", "Doanh Thu Thuần (VNĐ)", "Tỷ Lệ Lấp Đầy (%)"})
	for _, cb := range analytics.CategoryBreakdown {
		_ = writer.Write([]string{
			models.EscapeCSVField(cb.CategoryName),
			fmt.Sprintf("%d", cb.Price),
			fmt.Sprintf("%d", cb.TotalCapacity),
			fmt.Sprintf("%d", cb.SoldSeats),
			fmt.Sprintf("%d", cb.RemainingSeats),
			fmt.Sprintf("%d", cb.CheckedInSeats),
			fmt.Sprintf("%d", cb.GrossRevenue),
			fmt.Sprintf("%d", cb.PlatformFee),
			fmt.Sprintf("%d", cb.NetProfit),
			fmt.Sprintf("%.2f%%", cb.FillRatePercent),
		})
	}
	_ = writer.Write([]string{""})

	// Section 3: Timeline
	_ = writer.Write([]string{"Ngày", "Số Vé Bán Trong Ngày", "Doanh Thu Gộp (VNĐ)", "Phí Sàn (VNĐ)", "Doanh Thu Thuần (VNĐ)"})
	for _, t := range analytics.Timeline {
		_ = writer.Write([]string{
			models.EscapeCSVField(t.Date),
			fmt.Sprintf("%d", t.TicketsSold),
			fmt.Sprintf("%d", t.GrossRevenue),
			fmt.Sprintf("%d", t.PlatformFee),
			fmt.Sprintf("%d", t.NetProfit),
		})
	}
	_ = writer.Write([]string{""})

	// Section 4: Hourly Check-in
	_ = writer.Write([]string{"Khung Giờ", "Số Lượt Check-in"})
	for _, h := range analytics.HourlyCheckIns {
		_ = writer.Write([]string{
			fmt.Sprintf("%02d:00 - %02d:59", h.Hour, h.Hour),
			fmt.Sprintf("%d", h.Count),
		})
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("lỗi ghi dữ liệu CSV: %w", err)
	}

	return buf.Bytes(), nil
}

