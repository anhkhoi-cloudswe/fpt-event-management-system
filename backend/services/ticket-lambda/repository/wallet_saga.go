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
	"github.com/fpt-event-services/common/email"
	"github.com/fpt-event-services/common/logger"
	walletModels "github.com/fpt-event-services/common/models"
	ticketpdf "github.com/fpt-event-services/common/pdf"
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
	log := logger.Default()
	client := utils.NewInternalClient()

	log.Info("[SAGA] 🚀 Starting Wallet Payment Saga: user=%d, event=%d, amount=%d, seats=%v",
		userID, eventID, amount, seatIDs)

	// ===== VALIDATION: CHECK EVENT STATUS (same as monolith) =====
	var eventStatus string
	var startTime time.Time
	err := r.db.QueryRowContext(ctx, "SELECT status, start_time FROM Event WHERE event_id = ?", eventID).Scan(&eventStatus, &startTime)
	if err != nil {
		return "", fmt.Errorf("event not found")
	}

	if eventStatus != "OPEN" {
		fmt.Printf("[SECURITY] Cảnh báo: User %d cố tình đặt vé cho sự kiện CLOSED (ID: %d), status=%s\n", userID, eventID, eventStatus)
		return "", fmt.Errorf("Sự kiện đã kết thúc hoặc đã đóng, không thể đặt thêm ghế")
	}

	now := time.Now()
	if now.After(startTime) || now.Equal(startTime) {
		fmt.Printf("[BOOKING_SECURITY] User %d blocked from buying ticket for Event %d (Event started at %s)\n", userID, eventID, startTime.Format(time.RFC3339))
		return "", fmt.Errorf("Sự kiện đã bắt đầu hoặc kết thúc, không thể đặt thêm vé")
	}

	// ===== 0đ FAST-PATH: Vé miễn phí — bỏ qua Reserve/Confirm, ví không thể giữ chỗ 0 đồng =====
	if amount == 0 {
		log.Info("[SAGA] 🎉 amount=0 → Fast-path: bỏ qua Reserve/Confirm, tạo vé trực tiếp")

		ticketIds, ticketData, err := r.createTicketsInDB(ctx, userID, eventID, categoryTicketID, seatIDs)
		if err != nil {
			log.Warn("[SAGA] ❌ Ticket creation failed (free path): %v", err)
			return "", fmt.Errorf("error creating tickets: %w", err)
		}

		// Tạo Bill miễn phí
		billResult, billErr := r.db.ExecContext(ctx,
			"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES (?, 0, 'VND', 'Wallet', 'PAID', NOW(), NOW())",
			userID,
		)
		if billErr != nil {
			log.Warn("[SAGA] ⚠️ Failed to create free bill (non-critical): %v", billErr)
		} else {
			billID, _ := billResult.LastInsertId()
			log.Info("[SAGA] ✅ Free bill created: billID=%d", billID)
		}

		go r.sendTicketEmailsAsync(ticketData, userID, eventID, startTime)

		log.Info("[SAGA] 🎉 Free Wallet SAGA COMPLETED: user=%d, tickets=%s", userID, strings.Join(ticketIds, ","))
		return strings.Join(ticketIds, ","), nil
	}

	// ===== SAGA STEP 1: RESERVE (Giữ tiền tạm) =====
	log.Info("[SAGA_STEP_1] 🔒 Reserving wallet: user=%d, amount=%d", userID, amount)

	reserveReq := walletModels.WalletReserveRequest{
		UserID:        userID,
		Amount:        float64(amount),
		ReferenceType: "TICKET_PURCHASE",
		ReferenceID:   fmt.Sprintf("event:%d:cat:%d", eventID, categoryTicketID),
		Description:   fmt.Sprintf("Mua vé event %d, %d ghế", eventID, len(seatIDs)),
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
	billResult, err := r.db.ExecContext(ctx,
		"INSERT INTO Bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES (?, ?, 'VND', 'Wallet', 'PAID', NOW(), NOW())",
		userID, float64(amount),
	)
	if err != nil {
		log.Warn("[SAGA] ⚠️ Failed to create bill (non-critical): %v", err)
	} else {
		billID, _ := billResult.LastInsertId()
		fmt.Printf("[BILL_CREATED] ✅ Da xuat hoa don ID: %d cho phuong thuc: %s\n", billID, "Wallet")
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

	ticketIds := []string{}
	qrValues := []string{}
	seatCodes := []string{}
	categoryNames := []string{}
	prices := []float64{}
	areaNames := []string{}
	var eventTitle, venueName, venueAddress, userEmail, userName string
	var totalPrice float64

	for _, seatID := range seatIDs {
		fmt.Printf("[SAGA] Creating ticket for seatID: %d, userID: %d, eventID: %d\n", seatID, userID, eventID)

		// Create ticket
		insertTicketQuery := `
			INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status, created_at)
			VALUES (?, ?, ?, ?, 'PENDING_QR', 'BOOKED', NOW())
		`
		result, err := tx.ExecContext(ctx, insertTicketQuery, userID, eventID, categoryTicketID, seatID)
		if err != nil {
			return nil, nil, fmt.Errorf("error creating ticket for seat %d: %w", seatID, err)
		}

		ticketID, err := result.LastInsertId()
		if err != nil {
			return nil, nil, fmt.Errorf("error getting ticket ID: %w", err)
		}

		// Generate QR code
		qrBase64, err := qrcode.GenerateTicketQRBase64(int(ticketID), 300)
		if err != nil {
			fmt.Printf("[SAGA] ⚠️ Failed to generate QR for Ticket ID: %d, error: %v\n", ticketID, err)
			qrBase64 = fmt.Sprintf("PENDING_QR_%d", ticketID)
		}

		// Update ticket with QR code
		_, err = tx.ExecContext(ctx, "UPDATE Ticket SET qr_code_value = ? WHERE ticket_id = ?", qrBase64, ticketID)
		if err != nil {
			return nil, nil, fmt.Errorf("error updating QR code for ticket %d: %w", ticketID, err)
		}

		ticketIds = append(ticketIds, fmt.Sprintf("%d", ticketID))
		qrValues = append(qrValues, qrBase64)

		// Get ticket details for email (same JOIN as monolith)
		selectTicketQuery := `
			SELECT 
				e.title, e.start_time, v.location, v.venue_name,
				va.area_name, s.seat_code, ct.name, ct.price, u.email, u.full_name
			FROM Ticket t
			JOIN Event e ON t.event_id = e.event_id
			JOIN Venue_Area va ON e.area_id = va.area_id
			JOIN Venue v ON va.venue_id = v.venue_id
			JOIN Seat s ON t.seat_id = s.seat_id
			JOIN Category_Ticket ct ON t.category_ticket_id = ct.category_ticket_id
			JOIN users u ON t.user_id = u.user_id
			WHERE t.ticket_id = ?
		`

		var categoryName, areaName, seatCode string
		var price float64
		var scanStartTime time.Time
		err = tx.QueryRowContext(ctx, selectTicketQuery, ticketID).Scan(
			&eventTitle, &scanStartTime, &venueAddress, &venueName,
			&areaName, &seatCode, &categoryName, &price, &userEmail, &userName,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("error getting ticket details for ticket %d: %w", ticketID, err)
		}

		seatCodes = append(seatCodes, seatCode)
		categoryNames = append(categoryNames, categoryName)
		prices = append(prices, price)
		areaNames = append(areaNames, areaName)
		totalPrice += price
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
		_, err := r.db.ExecContext(ctx, "DELETE FROM Ticket WHERE ticket_id = ?", ticketID)
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

	// Phase 6: Dual path - Notification API or local PDF+email
	if config.IsFeatureEnabled(config.FlagNotificationAPIEnabled) {
		ctx := context.Background()
		if len(data.TicketIDs) == 1 {
			ticketID, _ := strconv.Atoi(data.TicketIDs[0])
			seatRow, seatNumber := parseSeatCode(data.SeatCodes[0])
			if err := sendSingleTicketViaNotifyAPI(ctx, map[string]interface{}{
				"ticket_id":      ticketID,
				"user_email":     data.UserEmail,
				"user_name":      data.UserName,
				"event_title":    data.EventTitle,
				"start_time":     startTime.Format(time.RFC3339),
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
				log.Warn("[SAGA_EMAIL] Notification API failed, falling back to local: %v", err)
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
				"start_time":    startTime.Format(time.RFC3339),
				"venue_name":    data.VenueName,
				"area_name":     data.AreaNames[0],
				"venue_address": data.VenueAddress,
				"total_amount":  fmt.Sprintf("%.0f", data.TotalPrice),
				"map_url":       fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(data.VenueAddress)),
				"items":         items,
			}); err != nil {
				log.Warn("[SAGA_EMAIL] Notification API failed for multiple tickets, falling back: %v", err)
			} else {
				log.Info("[SAGA_EMAIL] ✅ Multiple tickets email sent via Notification API")
				return
			}
		}
	}

	// Legacy path: Generate PDF locally + send email directly

	// Generate PDF attachments
	pdfAttachments := []email.PDFAttachment{}
	for i, ticketIDStr := range data.TicketIDs {
		ticketID, _ := strconv.Atoi(ticketIDStr)

		// Parse QR Base64 to PNG bytes
		qrPngBytes, err := parseBase64ToPNG(data.QRValues[i])
		if err != nil {
			fmt.Printf("[SAGA_PDF] ⚠️ Failed to parse QR for ticket %d: %v\n", ticketID, err)
			continue
		}

		// Parse seat code to row + number
		seatRow, seatNumber := parseSeatCode(data.SeatCodes[i])

		pdfBytes, err := ticketpdf.GenerateTicketPDF(ticketpdf.TicketPDFData{
			TicketCode:     fmt.Sprintf("TKT_%d", ticketID),
			EventName:      data.EventTitle,
			EventDate:      startTime,
			VenueName:      data.VenueName,
			AreaName:       data.AreaNames[i],
			Address:        data.VenueAddress,
			SeatRow:        seatRow,
			SeatNumber:     seatNumber,
			CategoryName:   data.CategoryNames[i],
			Price:          formatCurrency(fmt.Sprintf("%.0f", data.Prices[i])),
			UserName:       data.UserName,
			UserEmail:      data.UserEmail,
			QRCodePngBytes: qrPngBytes,
		})
		if err != nil {
			fmt.Printf("[SAGA_PDF] ⚠️ Failed to generate PDF for ticket %d: %v\n", ticketID, err)
			continue
		}

		pdfAttachments = append(pdfAttachments, email.PDFAttachment{
			Filename: fmt.Sprintf("ticket_%d_%s.pdf", ticketID, data.SeatCodes[i]),
			Data:     pdfBytes,
		})
	}

	// Send email
	emailService := email.NewEmailService(nil)

	if len(data.TicketIDs) == 1 {
		emailData := email.TicketEmailData{
			UserEmail:     data.UserEmail,
			UserName:      data.UserName,
			EventTitle:    data.EventTitle,
			TicketIDs:     data.TicketIDs[0],
			TicketTypes:   data.CategoryNames[0],
			SeatCodes:     data.SeatCodes[0],
			VenueName:     data.VenueName,
			VenueAddress:  data.VenueAddress,
			TotalAmount:   fmt.Sprintf("%.0f", data.TotalPrice),
			StartTime:     startTime.Format("2006-01-02 15:04"),
			PaymentMethod: "wallet",
			MapURL:        fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(data.VenueAddress)),
		}
		if len(pdfAttachments) > 0 {
			emailData.PDFAttachment = pdfAttachments[0].Data
			emailData.PDFFilename = pdfAttachments[0].Filename
		}
		if err := emailService.SendTicketEmail(emailData); err != nil {
			fmt.Printf("[SAGA_EMAIL] ⚠️ Failed to send email: %v\n", err)
		}
	} else {
		seatList := strings.Join(data.SeatCodes, ", ")
		emailData := email.MultipleTicketsEmailData{
			UserEmail:     data.UserEmail,
			UserName:      data.UserName,
			EventTitle:    data.EventTitle,
			EventDate:     startTime.Format("2006-01-02 15:04"),
			VenueName:     data.VenueName,
			VenueAddress:  data.VenueAddress,
			TicketCount:   len(data.TicketIDs),
			SeatList:      seatList,
			TotalAmount:   fmt.Sprintf("%.0f", data.TotalPrice),
			GoogleMapsURL: fmt.Sprintf("https://www.google.com/maps/search/?api=1&query=%s", url.QueryEscape(data.VenueAddress)),
		}
		if len(pdfAttachments) > 0 {
			emailData.PDFAttachments = pdfAttachments
		}
		if err := emailService.SendMultipleTicketsEmail(emailData); err != nil {
			fmt.Printf("[SAGA_EMAIL] ⚠️ Failed to send multi-ticket email: %v\n", err)
		}
	}

	log.Info("[SAGA_EMAIL] ✅ Email sent for %d tickets", len(data.TicketIDs))
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
