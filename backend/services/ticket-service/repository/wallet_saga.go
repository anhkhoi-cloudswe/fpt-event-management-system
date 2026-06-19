package repository

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/logger"
	walletModels "github.com/fpt-event-services/common/models"
	"github.com/fpt-event-services/common/qrcode"
	"github.com/fpt-event-services/common/utils"
)

// ============================================================
// ProcessWalletPaymentSaga - Saga Pattern cho Wallet Payment
//
// THAY THẾ ProcessWalletPayment monolith khi SAGA_ENABLED=true
//
// Saga Flow (3 bước):
//   Bước 1 (Reserve):  POST /internal/wallet/reserve
//                       → Giữ tiền tạm, nhận reservationId
//   Bước 2 (Create):   CREATE Ticket records trong DB local
//                       → INSERT Ticket + QR gen + UPDATE QR
//   Bước 3 (Confirm):  POST /internal/wallet/confirm
//                       → Xác nhận trừ tiền thật
//
// Compensation (nếu bất kỳ bước nào fail):
//   - Bước 2 fail → POST /internal/wallet/release (hoàn tiền)
//   - Bước 3 fail → DELETE tickets + POST /internal/wallet/release
//
// So sánh với Monolith:
//   Monolith: 1 transaction SQL duy nhất (lock Wallet + INSERT tickets)
//   Saga:     3 bước riêng biệt, mỗi bước có compensation riêng
//
// JSON Response: 100% tương thích (return ticketIds string)
// ============================================================

func (r *TicketRepository) ProcessWalletPaymentSaga(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, amount int) (string, error) {
	// Auto release expired bills first (Lazy Expiry Evaluation)
	r.AutoReleaseExpiredPendingBills(ctx)

	// Rule 2 check: Check if user is locked out due to seat hoarding
	penaltyMutex.RLock()
	penalty, exists := userPenalties[userID]
	if exists && !penalty.LockedUntil.IsZero() && time.Now().Before(penalty.LockedUntil) {
		remainingSeconds := int(penalty.LockedUntil.Sub(time.Now()).Seconds())
		penaltyMutex.RUnlock()
		return "", fmt.Errorf("[E4003]|%d", remainingSeconds)
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
			SELECT t.event_id, t.category_ticket_id, t.seat_id, COALESCE(s.seat_code, 'ONLINE') as seat_code 
			FROM Ticket t
			LEFT JOIN Seat s ON t.seat_id = s.seat_id
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
				var eID, cID int
				var seatID sql.NullInt64
				var code string
				if scanErr := rows.Scan(&eID, &cID, &seatID, &code); scanErr == nil {
					evID = eID
					catID = cID
					if seatID.Valid {
						seatIDsList = append(seatIDsList, strconv.Itoa(int(seatID.Int64)))
						pendingSeatIDs = append(pendingSeatIDs, int(seatID.Int64))
					}
					seatCodes = append(seatCodes, code)
				}
			}
		}

		// Check if request seatIDs match the pending bill's seatIDs exactly
		if equalIntSlices(pendingSeatIDs, seatIDs) {
			return r.ProcessWalletPaymentSagaForExistingBill(ctx, userID, pendingBillID, amount)
		}

		seatsStr := strings.Join(seatCodes, ",")
		seatIDsStr := strings.Join(seatIDsList, ",")

		return "", fmt.Errorf("[E4002]|%d|%s|%s|%d|%d|%d", pendingBillID, seatsStr, seatIDsStr, evID, catID, remainingSeconds)
	}

	log := logger.Default()
	client := utils.NewInternalClient()

	log.Info("[SAGA] 🚀 Starting Wallet Payment Saga: user=%d, event=%d, amount=%d, seats=%v",
		userID, eventID, amount, seatIDs)

	// ===== VALIDATION: CHECK EVENT STATUS (same as monolith) =====
	var eventStatus string
	var startTime time.Time
	var eventFormat string
	err := r.db.QueryRowContext(ctx, "SELECT status, start_time, event_format FROM Event WHERE event_id = $1", eventID).Scan(&eventStatus, &startTime, &eventFormat)
	if err != nil {
		return "", fmt.Errorf("event not found")
	}

	if eventStatus != "OPEN" {
		fmt.Printf("[SECURITY] Cảnh báo: User %d cố tình đặt vé cho sự kiện CLOSED (ID: %d), status=%s\n", userID, eventID, eventStatus)
		return "", fmt.Errorf("Sự kiện đã kết thúc hoặc đã đóng, không thể đặt thêm ghế")
	}

	now := utils.NowInVietnam()
	if now.After(startTime) || now.Equal(startTime) {
		fmt.Printf("[BOOKING_SECURITY] User %d blocked from buying ticket for Event %d (Event started at %s)\n", userID, eventID, startTime.Format(time.RFC3339))
		return "", fmt.Errorf("Sự kiện đã bắt đầu hoặc kết thúc, không thể đặt thêm vé")
	}

	isOnline := strings.ToUpper(eventFormat) == "ONLINE"

	// ===== 0đ FAST-PATH: Vé miễn phí — bỏ qua Reserve/Confirm, ví không thể giữ chỗ 0 đồng =====
	if amount == 0 {
		log.Info("[SAGA] 🎉 amount=0 → Fast-path: bỏ qua Reserve/Confirm, tạo vé trực tiếp")

		ticketIds, ticketData, err := r.createTicketsInDB(ctx, userID, eventID, categoryTicketID, seatIDs)
		if err != nil {
			log.Warn("[SAGA] ❌ Ticket creation failed (free path): %v", err)
			return "", fmt.Errorf("error creating tickets: %w", err)
		}

		// Tạo Bill miễn phí
		var billID int64
		billErr := r.db.QueryRowContext(ctx,
			"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES ($1, 0, 'VND', 'FREE', 'PAID', NOW(), NOW()) RETURNING bill_id",
			userID,
		).Scan(&billID)
		if billErr != nil {
			log.Warn("[SAGA] ⚠️ Failed to create free bill (non-critical): %v", billErr)
		} else {
			log.Info("[SAGA] ✅ Free bill created: billID=%d", billID)
		}

		go r.sendTicketEmailsAsync(ticketData, userID, eventID, startTime)

		log.Info("[SAGA] 🎉 Free Wallet SAGA COMPLETED: user=%d, tickets=%s", userID, strings.Join(ticketIds, ","))
		return strings.Join(ticketIds, ","), nil
	}

	// ===== SAGA STEP 1: RESERVE (Giữ tiền tạm) =====
	log.Info("[SAGA_STEP_1] 🔒 Reserving wallet: user=%d, amount=%d", userID, amount)

	var reserveDesc string
	if isOnline {
		reserveDesc = fmt.Sprintf("Mua vé online event %d", eventID)
	} else {
		reserveDesc = fmt.Sprintf("Mua vé event %d, %d ghế", eventID, len(seatIDs))
	}

	reserveReq := walletModels.WalletReserveRequest{
		UserID:        userID,
		Amount:        float64(amount),
		ReferenceType: "TICKET_PURCHASE",
		ReferenceID:   fmt.Sprintf("event:%d:cat:%d", eventID, categoryTicketID),
		Description:   reserveDesc,
		TTLSeconds:    300, // 5 phút
	}

	var reserveResp walletModels.WalletReserveResponse
	reserveURL := utils.GetTicketServiceURL() + "/internal/wallet/reserve"
	statusCode, err := client.PostJSON(ctx, reserveURL, reserveReq, &reserveResp)
	if err != nil {
		log.Warn("[SAGA_STEP_1] ❌ Reserve API call failed: %v", err)
		return "", fmt.Errorf("error reserving wallet: %w", err)
	}

	if statusCode != 200 || !reserveResp.Success {
		log.Info("[SAGA_STEP_1] ❌ Reserve failed: status=%d, message=%s", statusCode, reserveResp.Message)
		return "", fmt.Errorf("%s", reserveResp.Message)
	}

	reservationID := reserveResp.ReservationID
	log.Info("[SAGA_STEP_1] ✅ Reserve success: reservationId=%s, before=%.2f, after=%.2f",
		reservationID, reserveResp.BalanceBefore, reserveResp.BalanceAfter)

	// ===== SAGA STEP 2: CREATE TICKETS (Local DB Transaction) =====
	log.Info("[SAGA_STEP_2] 🎫 Creating tickets in local DB...")

	ticketIds, ticketData, err := r.createTicketsInDB(ctx, userID, eventID, categoryTicketID, seatIDs)
	if err != nil {
		// COMPENSATION: Release reserved amount
		log.Warn("[SAGA_STEP_2] ❌ Ticket creation failed: %v. Starting compensation...", err)
		r.releaseReservation(ctx, client, reservationID, userID, "ticket_creation_failed: "+err.Error())
		return "", fmt.Errorf("error creating tickets: %w", err)
	}

	log.Info("[SAGA_STEP_2] ✅ Tickets created: %s", strings.Join(ticketIds, ","))

	// ===== SAGA STEP 3: CONFIRM (Xác nhận trừ tiền) =====
	log.Info("[SAGA_STEP_3] ✅ Confirming wallet deduction...")

	confirmReq := walletModels.WalletConfirmRequest{
		ReservationID: reservationID,
		UserID:        userID,
		ReferenceID:   fmt.Sprintf("tickets:%s", strings.Join(ticketIds, ",")),
	}

	var confirmResp walletModels.WalletConfirmResponse
	confirmURL := utils.GetTicketServiceURL() + "/internal/wallet/confirm"
	statusCode, err = client.PostJSON(ctx, confirmURL, confirmReq, &confirmResp)
	if err != nil || statusCode != 200 || !confirmResp.Success {
		// COMPENSATION: Delete created tickets + Release reserved amount
		log.Warn("[SAGA_STEP_3] ❌ Confirm failed: err=%v, status=%d. Starting compensation...", err, statusCode)
		r.compensateTickets(ctx, ticketIds)
		r.releaseReservation(ctx, client, reservationID, userID, "confirm_failed")
		return "", fmt.Errorf("error confirming wallet payment")
	}

	log.Info("[SAGA_STEP_3] ✅ Confirm success: reservationId=%s", reservationID)

	// ===== STEP 3.5: CREATE BILL (same as monolith) =====
	// ⭐ CRITICAL FIX: If amount == 0, MUST set payment_method to 'FREE'
	paymentMethodForBill := "Wallet"
	if amount == 0 {
		paymentMethodForBill = "FREE"
	}

	var billID int64
	err = r.db.QueryRowContext(ctx,
		"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES ($1, $2, 'VND', $3, 'PAID', NOW(), NOW()) RETURNING bill_id",
		userID, float64(amount), paymentMethodForBill,
	).Scan(&billID)
	if err != nil {
		log.Warn("[SAGA] ⚠️ Failed to create bill (non-critical): %v", err)
	} else {
		fmt.Printf("[BILL_CREATED] ✅ Da xuat hoa don ID: %d cho phuong thuc: %s\n", billID, paymentMethodForBill)
	}

	// ===== STEP 4: SEND EMAIL & PDF (same as monolith, post-saga) =====
	go r.sendTicketEmailsAsync(ticketData, userID, eventID, startTime)

	log.Info("[SAGA] 🎉 Wallet Payment Saga COMPLETED: user=%d, tickets=%s, reservationId=%s",
		userID, strings.Join(ticketIds, ","), reservationID)

	return strings.Join(ticketIds, ","), nil
}

// ============================================================
// SAGA STEP 2 HELPER: Create Tickets in Local DB
// Tạo vé trong DB local (không liên quan tới Wallet)
// ============================================================

// sagaTicketData chứa dữ liệu vé đã tạo (dùng cho email/PDF)
type sagaTicketData struct {
	TicketIDs     []string
	QRValues      []string
	SeatCodes     []string
	CategoryNames []string
	Prices        []float64
	AreaNames     []string
	EventTitle    string
	EventStart    time.Time
	EventEnd      time.Time
	VenueName     string
	VenueAddress  string
	UserEmail     string
	UserName      string
	TotalPrice    float64
}

func (r *TicketRepository) createTicketsInDB(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int) ([]string, *sagaTicketData, error) {
	// Start local transaction for ticket creation only
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  false,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("error starting ticket creation transaction: %w", err)
	}
	defer tx.Rollback()

	var eventFormat string
	err = tx.QueryRowContext(ctx, "SELECT event_format FROM Event WHERE event_id = $1", eventID).Scan(&eventFormat)
	if err != nil {
		return nil, nil, fmt.Errorf("error querying event format: %w", err)
	}
	isOnline := strings.ToUpper(eventFormat) == "ONLINE"

	ticketIds := []string{}
	qrValues := []string{}
	seatCodes := []string{}
	categoryNames := []string{}
	prices := []float64{}
	areaNames := []string{}
	var eventTitle, venueName, venueAddress, userEmail, userName string
	var eventStart, eventEnd time.Time
	var totalPrice float64

	if isOnline {
		insertTicketQuery := `
			INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at)
			VALUES ($1, $2, $3, NULL, 'PENDING_QR', 'BOOKED', NOW())
			RETURNING ticket_id
		`
		var ticketID int64
		err = tx.QueryRowContext(ctx, insertTicketQuery, userID, eventID, categoryTicketID).Scan(&ticketID)
		if err != nil {
			return nil, nil, fmt.Errorf("error creating online ticket: %w", err)
		}

		qrBase64, err := qrcode.GenerateTicketQRBase64(int(ticketID), 300)
		if err != nil {
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
		}

		_, err = tx.ExecContext(ctx, "UPDATE Ticket SET qr_code_value = $1 WHERE ticket_id = $2", qrBase64, ticketID)
		if err != nil {
			return nil, nil, fmt.Errorf("error updating QR code for ticket %d: %w", ticketID, err)
		}

		ticketIds = append(ticketIds, fmt.Sprintf("%d", ticketID))
		qrValues = append(qrValues, qrBase64)

		selectTicketQuery := `
			SELECT 
				e.title, e.start_time, e.end_time,
				COALESCE(e.custom_location, 'Zoom/Google Meet') as location,
				COALESCE(e.custom_venue_name, 'Nền tảng trực tuyến') as venue_name,
				ct.name as category_name, ct.price, u.email, u.full_name
			FROM Ticket t
			JOIN Event e ON t.event_id = e.event_id
			JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			JOIN users u ON t.user_id = u.user_id
			WHERE t.ticket_id = $1
		`

		var categoryName string
		var price float64
		var scanStartTime time.Time
		var scanEndTime sql.NullTime
		err = tx.QueryRowContext(ctx, selectTicketQuery, ticketID).Scan(
			&eventTitle, &scanStartTime, &scanEndTime, &venueAddress, &venueName,
			&categoryName, &price, &userEmail, &userName,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("error getting ticket details: %w", err)
		}
		eventStart = scanStartTime
		if scanEndTime.Valid {
			eventEnd = scanEndTime.Time
		}

		seatCodes = append(seatCodes, "ONLINE")
		categoryNames = append(categoryNames, categoryName)
		prices = append(prices, price)
		areaNames = append(areaNames, "ONLINE")
		totalPrice += price
	} else {
		for _, seatID := range seatIDs {
			fmt.Printf("[SAGA] Creating ticket for seatID: %d, userID: %d, eventID: %d\n", seatID, userID, eventID)

			// Always resolve category by seat to support mixed-seat wallet purchases.
			var currentCategoryTicketID int
			err = tx.QueryRowContext(ctx, `
				SELECT s.category_ticket_id
				FROM Seat s
				JOIN Category_Ticket ct ON s.category_ticket_id = ct.category_ticket_id
				WHERE s.seat_id = $1 AND ct.event_id = $2
			`, seatID, eventID).Scan(&currentCategoryTicketID)
			if err != nil {
				return nil, nil, fmt.Errorf("error resolving category for seat %d: %w", seatID, err)
			}

			// Create ticket
			insertTicketQuery := `
				INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at)
				VALUES ($1, $2, $3, $4, 'PENDING_QR', 'BOOKED', NOW())
				RETURNING ticket_id
			`
			var ticketID int64
			err = tx.QueryRowContext(ctx, insertTicketQuery, userID, eventID, currentCategoryTicketID, seatID).Scan(&ticketID)
			if err != nil {
				return nil, nil, fmt.Errorf("error creating ticket for seat %d: %w", seatID, err)
			}

			// Generate QR code
			qrBase64, err := qrcode.GenerateTicketQRBase64(int(ticketID), 300)
			if err != nil {
				fmt.Printf("[SAGA] ⚠️ Failed to generate QR for Ticket ID: %d, error: %v\n", ticketID, err)
				qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
			}

			// Update ticket with QR code
			_, err = tx.ExecContext(ctx, "UPDATE Ticket SET qr_code_value = $1 WHERE ticket_id = $2", qrBase64, ticketID)
			if err != nil {
				return nil, nil, fmt.Errorf("error updating QR code for ticket %d: %w", ticketID, err)
			}

			ticketIds = append(ticketIds, fmt.Sprintf("%d", ticketID))
			qrValues = append(qrValues, qrBase64)

			// Get ticket details for email (same JOIN as monolith)
			selectTicketQuery := `
				SELECT 
					e.title, e.start_time, e.end_time, v.location, v.venue_name,
					va.area_name, s.seat_code, ct.name, ct.price, u.email, u.full_name
				FROM Ticket t
				JOIN Event e ON t.event_id = e.event_id
				JOIN Venue_Area va ON e.area_id = va.area_id
				JOIN Venue v ON va.venue_id = v.venue_id
				JOIN Seat s ON t.seat_id = s.seat_id
				JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
				JOIN users u ON t.user_id = u.user_id
				WHERE t.ticket_id = $1
			`

			var categoryName, areaName, seatCode string
			var price float64
			var scanStartTime time.Time
			var scanEndTime sql.NullTime
			err = tx.QueryRowContext(ctx, selectTicketQuery, ticketID).Scan(
				&eventTitle, &scanStartTime, &scanEndTime, &venueAddress, &venueName,
				&areaName, &seatCode, &categoryName, &price, &userEmail, &userName,
			)
			if err != nil {
				return nil, nil, fmt.Errorf("error getting ticket details for ticket %d: %w", ticketID, err)
			}
			eventStart = scanStartTime
			if scanEndTime.Valid {
				eventEnd = scanEndTime.Time
			}

			seatCodes = append(seatCodes, seatCode)
			categoryNames = append(categoryNames, categoryName)
			prices = append(prices, price)
			areaNames = append(areaNames, areaName)
			totalPrice += price
		}
	}

	// Commit ticket creation
	if err := tx.Commit(); err != nil {
		return nil, nil, fmt.Errorf("error committing ticket creation: %w", err)
	}

	data := &sagaTicketData{
		TicketIDs:     ticketIds,
		QRValues:      qrValues,
		SeatCodes:     seatCodes,
		CategoryNames: categoryNames,
		Prices:        prices,
		AreaNames:     areaNames,
		EventTitle:    eventTitle,
		EventStart:    eventStart,
		EventEnd:      eventEnd,
		VenueName:     venueName,
		VenueAddress:  venueAddress,
		UserEmail:     userEmail,
		UserName:      userName,
		TotalPrice:    totalPrice,
	}

	return ticketIds, data, nil
}

// ============================================================
// SAGA COMPENSATION HELPERS
// ============================================================

// releaseReservation gọi API release để hoàn tiền về ví
func (r *TicketRepository) releaseReservation(ctx context.Context, client *utils.InternalClient, reservationID string, userID int, reason string) {
	log := logger.Default()
	log.Info("[SAGA_COMPENSATE] 🔓 Releasing reservation: id=%s, user=%d, reason=%s", reservationID, userID, reason)

	releaseReq := walletModels.WalletReleaseRequest{
		ReservationID: reservationID,
		UserID:        userID,
		Reason:        reason,
	}

	releaseURL := utils.GetTicketServiceURL() + "/internal/wallet/release"
	var resp walletModels.WalletTransactionResponse
	statusCode, err := client.PostJSON(ctx, releaseURL, releaseReq, &resp)
	if err != nil || statusCode != 200 {
		log.Warn("[SAGA_COMPENSATE] ❌ Release API failed: err=%v, status=%d. MANUAL INTERVENTION REQUIRED!", err, statusCode)
		return
	}

	log.Info("[SAGA_COMPENSATE] ✅ Release success: reservationId=%s, refunded to user=%d", reservationID, userID)
}

// compensateTickets xóa các vé đã tạo (compensation khi confirm fail)
func (r *TicketRepository) compensateTickets(ctx context.Context, ticketIds []string) {
	log := logger.Default()
	log.Info("[SAGA_COMPENSATE] 🗑️ Deleting created tickets: %v", ticketIds)

	for _, ticketIDStr := range ticketIds {
		ticketID, _ := strconv.Atoi(ticketIDStr)
		_, err := r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = $1", ticketID)
		if err != nil {
			log.Warn("[SAGA_COMPENSATE] ⚠️ Failed to delete ticket %d: %v", ticketID, err)
		} else {
			log.Info("[SAGA_COMPENSATE] ✅ Deleted ticket %d", ticketID)
		}
	}
}

// ============================================================
// SAGA EMAIL/PDF HELPER (Async, same logic as monolith)
// ============================================================

func (r *TicketRepository) sendTicketEmailsAsync(data *sagaTicketData, userID, eventID int, startTime time.Time) {
	if data == nil || len(data.TicketIDs) == 0 {
		return
	}

	log := logger.Default()
	log.Info("[SAGA_EMAIL] 📧 Generating PDFs and sending emails for %d tickets...", len(data.TicketIDs))

	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		ctx := context.Background()
		startTimeVN := utils.FormatTimeToWallClockRFC3339(startTime)
		endTimeVN := ""
		if !data.EventEnd.IsZero() {
			endTimeVN = utils.FormatTimeToWallClockRFC3339(data.EventEnd)
		}
		if len(data.TicketIDs) == 1 {
			ticketID, _ := strconv.Atoi(data.TicketIDs[0])
			seatRow, seatNumber := parseSeatCode(data.SeatCodes[0])
			if err := sendSingleTicketViaNotifyAPI(ctx, map[string]interface{}{
				"ticket_id":      ticketID,
				"user_email":     data.UserEmail,
				"user_name":      data.UserName,
				"event_title":    data.EventTitle,
				"start_time":     startTimeVN,
				"end_time":       endTimeVN,
				"venue_name":     data.VenueName,
				"area_name":      data.AreaNames[0],
				"venue_address":  data.VenueAddress,
				"seat_code":      data.SeatCodes[0],
				"seat_row":       seatRow,
				"seat_number":    seatNumber,
				"category_name":  data.CategoryNames[0],
				"price":          formatCurrency(fmt.Sprintf("%.0f", data.Prices[0])),
				"qr_base64":      data.QRValues[0],
				"map_url":        fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(data.VenueAddress)),
				"payment_method": "wallet",
			}); err != nil {
				log.Error("[SAGA_EMAIL] Notification API failed for single ticket dispatch: %v", err)
			} else {
				log.Info("[SAGA_EMAIL] ✅ Single ticket email sent via Notification API")
				return
			}
		} else {
			items := []map[string]interface{}{}
			for i, ticketIDStr := range data.TicketIDs {
				ticketID, _ := strconv.Atoi(ticketIDStr)
				seatRow, seatNumber := parseSeatCode(data.SeatCodes[i])
				items = append(items, map[string]interface{}{
					"ticket_id":     ticketID,
					"qr_base64":     data.QRValues[i],
					"seat_code":     data.SeatCodes[i],
					"seat_row":      seatRow,
					"seat_number":   seatNumber,
					"category_name": data.CategoryNames[i],
					"price":         formatCurrency(fmt.Sprintf("%.0f", data.Prices[i])),
				})
			}
			if err := sendMultipleTicketsViaNotifyAPI(ctx, map[string]interface{}{
				"user_email":    data.UserEmail,
				"user_name":     data.UserName,
				"event_title":   data.EventTitle,
				"start_time":    startTimeVN,
				"end_time":      endTimeVN,
				"venue_name":    data.VenueName,
				"area_name":     data.AreaNames[0],
				"venue_address": data.VenueAddress,
				"total_amount":  fmt.Sprintf("%.0f", data.TotalPrice),
				"map_url":       fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(data.VenueAddress)),
				"items":         items,
			}); err != nil {
				log.Error("[SAGA_EMAIL] Notification API failed for multiple ticket dispatch: %v", err)
			} else {
				log.Info("[SAGA_EMAIL] ✅ Multiple tickets email sent via Notification API")
				return
			}
		}
	} else {
		log.Warn("[SAGA_EMAIL] Notification API is disabled; skip direct email dispatch in ticket-service")
	}

	log.Info("[SAGA_EMAIL] ✅ Email dispatch request completed for %d tickets", len(data.TicketIDs))
}

// ============================================================
// UTILITY HELPERS
// ============================================================

// parseSeatCode splits seat code like "A1" into row="A" and number="1"
func parseSeatCode(seatCode string) (string, string) {
	seatRow := ""
	seatNumber := ""
	if len(seatCode) > 0 {
		for idx, char := range seatCode {
			if char >= '0' && char <= '9' {
				seatRow = seatCode[:idx]
				seatNumber = seatCode[idx:]
				break
			}
		}
		if seatRow == "" {
			seatRow = seatCode
			seatNumber = "1"
		}
	}
	return seatRow, seatNumber
}

// ============================================================
// GetUserWalletBalanceViaAPI - Lấy số dư ví qua internal API
// Thay thế GetUserWalletBalance (SELECT từ bảng Wallet)
// Dùng khi SAGA_ENABLED=true
// ============================================================
func (r *TicketRepository) GetUserWalletBalanceViaAPI(ctx context.Context, userID int) (float64, error) {
	log := logger.Default()
	client := utils.NewInternalClient()

	log.Info("[WALLET_API] 🔍 Fetching balance via API for userID: %d", userID)

	var balanceResp walletModels.WalletBalanceResponse
	balanceURL := utils.GetTicketServiceURL() + "/internal/wallet/balance"
	params := map[string]string{"userId": strconv.Itoa(userID)}

	statusCode, err := client.GetJSON(ctx, balanceURL, params, &balanceResp)
	if err != nil || statusCode != 200 {
		log.Warn("[WALLET_API] ❌ API call failed: err=%v, status=%d. Falling back to DB query...", err, statusCode)
		// Fallback to direct DB query
		return r.GetUserWalletBalance(ctx, userID)
	}

	log.Info("[WALLET_API] ✅ Balance for user %d: %.2f %s", userID, balanceResp.Balance, balanceResp.Currency)
	return balanceResp.Balance, nil
}

func (r *TicketRepository) ProcessWalletPaymentSagaForExistingBill(ctx context.Context, userID int, pendingBillID int64, amount int) (string, error) {
	log := logger.Default()
	client := utils.NewInternalClient()

	log.Info("[SAGA_RESUME] 🚀 Starting Resumed Wallet Payment Saga: user=%d, bill=%d, amount=%d",
		userID, pendingBillID, amount)

	var eventID int
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, `
		SELECT t.event_id, e.start_time
		FROM Ticket t
		JOIN Event e ON t.event_id = e.event_id
		WHERE t.bill_id = $1 LIMIT 1
	`, pendingBillID).Scan(&eventID, &startTime)
	if err != nil {
		return "", fmt.Errorf("error resolving event details: %w", err)
	}

	log.Info("[SAGA_STEP_1] 🔒 Reserving wallet: user=%d, amount=%d", userID, amount)

	reserveReq := walletModels.WalletReserveRequest{
		UserID:        userID,
		Amount:        float64(amount),
		ReferenceType: "TICKET_PURCHASE",
		ReferenceID:   fmt.Sprintf("bill:%d", pendingBillID),
		Description:   fmt.Sprintf("Thanh toan hoa don giữ chỗ %d", pendingBillID),
		TTLSeconds:    300,
	}

	var reserveResp walletModels.WalletReserveResponse
	reserveURL := utils.GetTicketServiceURL() + "/internal/wallet/reserve"
	statusCode, err := client.PostJSON(ctx, reserveURL, reserveReq, &reserveResp)
	if err != nil {
		log.Warn("[SAGA_STEP_1] ❌ Reserve API call failed: %v", err)
		return "", fmt.Errorf("error reserving wallet: %w", err)
	}

	if statusCode != 200 || !reserveResp.Success {
		log.Info("[SAGA_STEP_1] ❌ Reserve failed: status=%d, message=%s", statusCode, reserveResp.Message)
		return "", fmt.Errorf("%s", reserveResp.Message)
	}

	reservationID := reserveResp.ReservationID
	log.Info("[SAGA_STEP_1] ✅ Reserve success: reservationId=%s, before=%.2f, after=%.2f",
		reservationID, reserveResp.BalanceBefore, reserveResp.BalanceAfter)

	log.Info("[SAGA_STEP_2] 🎫 Resuming and updating tickets in local DB...")

	ticketIds, ticketData, err := r.resumeTicketsInDB(ctx, userID, pendingBillID)
	if err != nil {
		log.Warn("[SAGA_STEP_2] ❌ Ticket update failed: %v. Starting compensation...", err)
		r.releaseReservation(ctx, client, reservationID, userID, "ticket_update_failed: "+err.Error())
		return "", fmt.Errorf("error resuming tickets: %w", err)
	}

	log.Info("[SAGA_STEP_2] ✅ Tickets updated: %s", strings.Join(ticketIds, ","))

	log.Info("[SAGA_STEP_3] ✅ Confirming wallet deduction...")

	confirmReq := walletModels.WalletConfirmRequest{
		ReservationID: reservationID,
		UserID:        userID,
		ReferenceID:   fmt.Sprintf("tickets:%s", strings.Join(ticketIds, ",")),
	}

	var confirmResp walletModels.WalletConfirmResponse
	confirmURL := utils.GetTicketServiceURL() + "/internal/wallet/confirm"
	statusCode, err = client.PostJSON(ctx, confirmURL, confirmReq, &confirmResp)
	if err != nil || statusCode != 200 || !confirmResp.Success {
		log.Warn("[SAGA_STEP_3] ❌ Confirm failed: err=%v, status=%d. Starting compensation...", err, statusCode)
		r.compensateResumedTickets(ctx, ticketIds, pendingBillID)
		r.releaseReservation(ctx, client, reservationID, userID, "confirm_failed")
		return "", fmt.Errorf("error confirming wallet payment")
	}

	log.Info("[SAGA_STEP_3] ✅ Confirm success: reservationId=%s", reservationID)

	_, err = r.db.ExecContext(ctx, `
		UPDATE Bill SET payment_status = 'PAID', paid_at = NOW(), payment_method = 'Wallet' WHERE bill_id = $1
	`, pendingBillID)
	if err != nil {
		log.Warn("[SAGA] ⚠️ Failed to update bill to PAID (non-critical): %v", err)
	}

	go r.sendTicketEmailsAsync(ticketData, userID, eventID, startTime)

	log.Info("[SAGA] 🎉 Resumed Wallet Payment Saga COMPLETED: user=%d, tickets=%s, reservationId=%s",
		userID, strings.Join(ticketIds, ","), reservationID)

	return strings.Join(ticketIds, ","), nil
}

func (r *TicketRepository) resumeTicketsInDB(ctx context.Context, userID int, pendingBillID int64) ([]string, *sagaTicketData, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  false,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("error starting ticket creation transaction: %w", err)
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `
		SELECT ticket_id, seat_id FROM Ticket WHERE bill_id = $1 AND status = 'PENDING'
	`, pendingBillID)
	if err != nil {
		return nil, nil, fmt.Errorf("error querying pending tickets: %w", err)
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
		return nil, nil, fmt.Errorf("no pending tickets found")
	}

	ticketIds := []string{}
	qrValues := []string{}
	seatCodes := []string{}
	categoryNames := []string{}
	prices := []float64{}
	areaNames := []string{}
	var eventTitle, venueName, venueAddress, userEmail, userName string
	var eventStart, eventEnd time.Time
	var totalPrice float64

	for _, t := range tickets {
		qrBase64, err := qrcode.GenerateTicketQRBase64(int(t.ticketID), 300)
		if err != nil {
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", t.ticketID)
		}

		_, err = tx.ExecContext(ctx, `
			UPDATE Ticket SET qr_code_value = $1, status = 'BOOKED' WHERE ticket_id = $2
		`, qrBase64, t.ticketID)
		if err != nil {
			return nil, nil, fmt.Errorf("error updating ticket status: %w", err)
		}

		var eventFormat string
		err = tx.QueryRowContext(ctx, "SELECT e.event_format FROM Ticket t JOIN Event e ON t.event_id = e.event_id WHERE t.ticket_id = $1", t.ticketID).Scan(&eventFormat)
		if err != nil {
			return nil, nil, fmt.Errorf("error getting event format: %w", err)
		}
		isOnline := strings.ToUpper(eventFormat) == "ONLINE"

		if isOnline {
			selectQuery := `
				SELECT 
					e.title,
					e.start_time,
					e.end_time,
					COALESCE(e.custom_location, 'Zoom/Google Meet') as location,
					COALESCE(e.custom_venue_name, 'Nền tảng trực tuyến') as venue_name,
					ct.name as category_name,
					ct.price,
					u.email,
					u.full_name
				FROM Ticket t
				JOIN Event e ON t.event_id = e.event_id
				JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
				JOIN users u ON t.user_id = u.user_id
				WHERE t.ticket_id = $1
			`
			var categoryName string
			var price float64
			err = tx.QueryRowContext(ctx, selectQuery, t.ticketID).Scan(
				&eventTitle,
				&eventStart,
				&eventEnd,
				&venueAddress,
				&venueName,
				&categoryName,
				&price,
				&userEmail,
				&userName,
			)
			if err == nil {
				ticketIds = append(ticketIds, fmt.Sprintf("%d", t.ticketID))
				qrValues = append(qrValues, qrBase64)
				seatCodes = append(seatCodes, "ONLINE")
				categoryNames = append(categoryNames, categoryName)
				prices = append(prices, price)
				areaNames = append(areaNames, "ONLINE")
				totalPrice += price
			}
		} else {
			selectQuery := `
				SELECT 
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
			var categoryName, areaName, seatCode string
			var price float64
			err = tx.QueryRowContext(ctx, selectQuery, t.ticketID).Scan(
				&eventTitle,
				&eventStart,
				&eventEnd,
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
				ticketIds = append(ticketIds, fmt.Sprintf("%d", t.ticketID))
				qrValues = append(qrValues, qrBase64)
				seatCodes = append(seatCodes, seatCode)
				categoryNames = append(categoryNames, categoryName)
				prices = append(prices, price)
				areaNames = append(areaNames, areaName)
				totalPrice += price
			}
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, nil, fmt.Errorf("error committing ticket changes: %w", err)
	}

	ticketData := &sagaTicketData{
		TicketIDs:     ticketIds,
		QRValues:      qrValues,
		SeatCodes:     seatCodes,
		CategoryNames: categoryNames,
		Prices:        prices,
		AreaNames:     areaNames,
		EventTitle:    eventTitle,
		EventStart:    eventStart,
		EventEnd:      eventEnd,
		VenueName:     venueName,
		VenueAddress:  venueAddress,
		UserEmail:     userEmail,
		UserName:      userName,
		TotalPrice:    totalPrice,
	}

	return ticketIds, ticketData, nil
}

func (r *TicketRepository) compensateResumedTickets(ctx context.Context, ticketIds []string, pendingBillID int64) {
	log := logger.Default()
	log.Info("[COMPENSATION] Reverting resumed tickets back to PENDING status...")
	for _, tidStr := range ticketIds {
		tid, err := strconv.Atoi(tidStr)
		if err != nil {
			continue
		}
		
		_, err = r.db.ExecContext(ctx, "UPDATE Ticket SET status = 'PENDING', qr_code_value = 'PENDING_QR' WHERE ticket_id = $1", tid)
		if err != nil {
			log.Error("[COMPENSATION] Failed to reset ticket %d: %v", tid, err)
		}
		

	}
	
	_, err := r.db.ExecContext(ctx, "UPDATE Bill SET payment_status = 'PENDING' WHERE bill_id = $1", pendingBillID)
	if err != nil {
		log.Error("[COMPENSATION] Failed to reset bill %d: %v", pendingBillID, err)
	}
}
