package usecase

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/services/staff-lambda/models"
	"github.com/fpt-event-services/services/staff-lambda/repository"
)

// StaffUseCase handles staff business logic
type StaffUseCase struct {
	staffRepo *repository.StaffRepository
}

// NewStaffUseCase creates a new staff use case
func NewStaffUseCase() *StaffUseCase {
	return &StaffUseCase{
		staffRepo: repository.NewStaffRepository(),
	}
}

// ============================================================
// CheckIn - Xử lý check-in vé
// KHỚP VỚI Java StaffCheckinController
// ✅ Với ownership verification
// ============================================================
func (uc *StaffUseCase) CheckIn(ctx context.Context, userID int, qrValue string) (*models.CheckinResponse, error) {
	fmt.Printf("\n[CHECK-IN REQUEST] UserID=%d, QR/Code=%s\n", userID, qrValue)

	// Parse ticket IDs từ QR (hỗ trợ cả ticket_id và ticket_code)
	ticketIDs := uc.parseTicketIDs(qrValue)

	// ✅ Nếu không parse được ticket ID, thử tìm bằng ticket_code
	if len(ticketIDs) == 0 {
		fmt.Printf("[PARSE] Cannot parse as ticket ID, trying ticket_code: %s\n", qrValue)
		ticket, err := uc.staffRepo.GetTicketByCode(ctx, qrValue)
		if err == nil && ticket != nil {
			ticketIDs = append(ticketIDs, ticket.TicketID)
			fmt.Printf("[PARSE] ✓ Found ticket by code: TicketID=%d, Code=%s\n", ticket.TicketID, ticket.TicketCode)
		} else {
			fmt.Printf("[PARSE] ✗ Ticket code not found: %s (error: %v)\n", qrValue, err)
		}
	}

	if len(ticketIDs) == 0 {
		errMsg := fmt.Sprintf("Không tìm thấy mã vé '%s'. Vui lòng kiểm tra lại QR code hoặc nhập đúng mã vé.", qrValue)
		fmt.Printf("[ERROR] %s\n", errMsg)
		return &models.CheckinResponse{
			Success: false,
			Message: errMsg,
		}, nil
	}

	fmt.Printf("[PARSE] Found %d ticket(s): %v\n", len(ticketIDs), ticketIDs)

	results := []models.CheckinResult{}
	successCount := 0
	failCount := 0

	// Lấy thời gian hiện tại
	now := uc.staffRepo.GetCurrentTime()

	for _, ticketID := range ticketIDs {
		result := uc.processCheckin(ctx, userID, ticketID, now)
		results = append(results, result)

		if result.Success {
			successCount++
		} else {
			failCount++
		}
	}

	// Tạo message tổng hợp
	var message string
	if failCount == 0 {
		message = "Check-in thành công tất cả vé"
	} else if successCount == 0 {
		message = "Check-in thất bại tất cả vé"
	} else {
		message = "Check-in một phần: " + strconv.Itoa(successCount) + " thành công, " + strconv.Itoa(failCount) + " thất bại"
	}

	fmt.Printf("[RESULT] Success=%d, Fail=%d, Message=%s\n\n", successCount, failCount, message)

	return &models.CheckinResponse{
		Success:      failCount == 0,
		Message:      message,
		Results:      results,
		SuccessCount: successCount,
		FailCount:    failCount,
	}, nil
}

// processCheckin xử lý check-in 1 vé với race condition protection
// Sử dụng optimistic locking: check status trước, update với WHERE status = 'BOOKED'
// ✅ Với ownership verification và per-event config priority
func (uc *StaffUseCase) processCheckin(ctx context.Context, userID int, ticketID int, now time.Time) models.CheckinResult {
	result := models.CheckinResult{
		TicketID: ticketID,
		Success:  false,
	}

	fmt.Printf("\n[CHECK-IN START] UserID=%d, TicketID=%d\n", userID, ticketID)

	// Lấy thông tin vé
	ticket, err := uc.staffRepo.GetTicketForCheckin(ctx, ticketID)
	if err != nil {
		errMsg := fmt.Sprintf("Lỗi database khi tìm vé #%d: %v", ticketID, err)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}
	if ticket == nil {
		errMsg := fmt.Sprintf("Mã vé không hợp lệ: Không tìm thấy vé #%d trong hệ thống", ticketID)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}

	// 🔍 LOG: Thông tin vé đã tìm thấy
	fmt.Printf("[TICKET INFO] TicketID=%d, Code=%s, Status=%s, Customer=%s, EventID=%d, EventName=%s\n",
		ticket.TicketID, ticket.TicketCode, ticket.Status, ticket.CustomerName, ticket.EventID, ticket.EventName)

	// ✅ Kiểm tra ownership (chỉ Organizer sở hữu sự kiện mới quét được)
	fmt.Printf("[OWNERSHIP CHECK] Checking if UserID=%d owns EventID=%d...\n", userID, ticket.EventID)
	isOwner, err := uc.staffRepo.VerifyEventOwnership(ctx, userID, ticket.EventID)
	if err != nil {
		errMsg := fmt.Sprintf("Lỗi khi kiểm tra quyền sở hữu: %v", err)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}
	if !isOwner {
		errMsg := fmt.Sprintf("Bạn không có quyền quét vé của sự kiện '%s' (EventID=%d). Chỉ Organizer tạo sự kiện mới được quét vé.",
			ticket.EventName, ticket.EventID)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}
	fmt.Printf("[OWNERSHIP] ✓ UserID=%d is owner of EventID=%d\n", userID, ticket.EventID)

	result.EventName = &ticket.EventName
	result.SeatCode = ticket.SeatCode
	result.TicketCode = &ticket.TicketCode

	// Kiểm tra trạng thái vé
	fmt.Printf("[STATUS CHECK] Current ticket status: %s\n", ticket.Status)
	if ticket.Status == "CANCELLED" {
		errMsg := fmt.Sprintf("🚫 Vé #%d cỽa %s đã bị hủy, không thể check-in", ticketID, ticket.CustomerName)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}

	if ticket.Status == "CHECKED_IN" {
		checkInTimeStr := "lúc đó"
		if ticket.CheckInTime != nil {
			checkInTimeStr = ticket.CheckInTime.Format("15:04 02/01")
		}
		errMsg := fmt.Sprintf("📢 Vé đã vào cổng!\nKhách %s đã check-in %s.\nVui lòng không cho vào lần 2!", ticket.CustomerName, checkInTimeStr)
		result.Error = &errMsg
		result.PreviousTime = &checkInTimeStr
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}

	if ticket.Status == "CHECKED_OUT" {
		errMsg := fmt.Sprintf("🎫 Vé đã ra về!\nKhách %s đã check-out.\nVé không còn giá trị.", ticket.CustomerName)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}

	if ticket.Status != "BOOKED" {
		errMsg := fmt.Sprintf("Trạng thái vé không hợp lệ: %s (yêu cầu: BOOKED)", ticket.Status)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}
	fmt.Printf("[STATUS] ✓ Ticket status is BOOKED\n")

	// Kiểm tra thời gian (cho phép check-in trước X phút)
	// ✅ Sử dụng per-event config nếu có, fallback to global
	checkinWindow := config.GetEffectiveCheckinOffset(ticket.EventCheckinOffset)
	allowedTime := ticket.EventStartTime.Add(-time.Duration(checkinWindow) * time.Minute)

	// 🔍 DEBUG LOGS - In ra thời gian để kiểm tra
	fmt.Printf("\n[TIME CHECK] =====================================\n")
	fmt.Printf("  Event: %s (ID=%d)\n", ticket.EventName, ticket.EventID)
	fmt.Printf("  Thời gian hiện tại:              %s\n", now.Format("15:04:05 02/01/2006 MST"))
	fmt.Printf("  Thời gian bắt đầu sự kiện:       %s\n", ticket.EventStartTime.Format("15:04:05 02/01/2006 MST"))
	fmt.Printf("  Checkin offset (from DB):        %v\n", ticket.EventCheckinOffset)
	fmt.Printf("  Effective checkin window:        %d phút\n", checkinWindow)
	fmt.Printf("  Thời gian cho phép check-in từ:  %s\n", allowedTime.Format("15:04:05 02/01/2006 MST"))
	fmt.Printf("  Còn lại:                         %.0f phút\n", allowedTime.Sub(now).Minutes())
	fmt.Printf("  now.Before(allowedTime)?         %v\n", now.Before(allowedTime))
	fmt.Printf("=============================================\n\n")

	if now.Before(allowedTime) {
		minutesRemaining := int(allowedTime.Sub(now).Minutes())
		errMsg := fmt.Sprintf("⚠️ Quá sớm! Cổng check-in chỉ mở từ %s.\n(Con %d phút nữa) \n\nSự kiện: %s\nKhách: %s",
			allowedTime.Format("15:04"),
			minutesRemaining,
			ticket.EventName,
			ticket.CustomerName)
		result.Error = &errMsg
		fmt.Printf("[ERROR] ❌ Check-in bị từ chối do chưa đến giờ\n")
		return result
	}
	fmt.Printf("[TIME] ✓ Thời gian hợp lệ, tiếp tục check-in\n")

	// Kiểm tra sự kiện đã kết thúc chưa
	if now.After(ticket.EventEndTime) {
		errMsg := fmt.Sprintf("🚫 Sự kiện '%s' đã kết thúc vào lúc %s.\nKhông thể thực hiện check-in/out thêm.",
			ticket.EventName, ticket.EventEndTime.Format("15:04 02/01"))
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}
	fmt.Printf("[TIME] ✓ Sự kiện chưa kết thúc\n")

	// Thực hiện check-in với optimistic locking (chống race condition)
	// Query chỉ update nếu status = 'BOOKED', trả về rows affected
	fmt.Printf("[UPDATE] Attempting to update ticket status to CHECKED_IN...\n")
	rowsAffected, err := uc.staffRepo.UpdateTicketCheckin(ctx, ticketID)
	if err != nil {
		errMsg := fmt.Sprintf("Lỗi database khi cập nhật check-in: %v", err)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s\n", errMsg)
		return result
	}

	// Nếu không có row nào được update => vé đã được check-in bởi request khác (race condition)
	if rowsAffected == 0 {
		errMsg := fmt.Sprintf("⏳ Thao tác đang được xử lý hoặc đã hoàn tất ở một máy khác.\nVui lòng kiểm tra lại.\n\nVé #%d | Khách: %s | Sự kiện: %s",
			ticketID, ticket.CustomerName, ticket.EventName)
		result.Error = &errMsg
		fmt.Printf("[ERROR] %s (rowsAffected=0)\n", errMsg)
		return result
	}
	fmt.Printf("[UPDATE] ✓ Ticket updated successfully (rowsAffected=%d)\n", rowsAffected)

	result.Success = true
	msg := "Check-in thành công"
	result.Message = &msg
	checkInTime := now.Format("15:04 02/01/2006")
	result.CheckInTime = &checkInTime

	return result
}

// ============================================================
// CheckOut - Xử lý check-out vé
// KHỚP VỚI Java StaffCheckoutController
// ✅ Với ownership verification
// ============================================================
func (uc *StaffUseCase) CheckOut(ctx context.Context, userID int, qrValue string) (*models.CheckoutResponse, error) {
	// Parse ticket IDs từ QR
	ticketIDs := uc.parseTicketIDs(qrValue)

	if len(ticketIDs) == 0 {
		return &models.CheckoutResponse{
			Success: false,
			Message: "Không tìm thấy mã vé. Vui lòng quét lại mã QR",
		}, nil
	}

	results := []models.CheckoutResult{}
	successCount := 0
	failCount := 0

	// Lấy thời gian hiện tại
	now := uc.staffRepo.GetCurrentTime()

	for _, ticketID := range ticketIDs {
		result := uc.processCheckout(ctx, userID, ticketID, now)
		results = append(results, result)

		if result.Success {
			successCount++
		} else {
			failCount++
		}
	}

	// Tạo message tổng hợp
	var message string
	if failCount == 0 {
		message = "Check-out thành công tất cả vé"
	} else if successCount == 0 {
		message = "Check-out thất bại tất cả vé"
	} else {
		message = "Check-out một phần: " + strconv.Itoa(successCount) + " thành công, " + strconv.Itoa(failCount) + " thất bại"
	}

	return &models.CheckoutResponse{
		Success:      failCount == 0,
		Message:      message,
		Results:      results,
		SuccessCount: successCount,
		FailCount:    failCount,
	}, nil
}

// processCheckout xử lý check-out 1 vé với race condition protection
// Sử dụng optimistic locking: check status trước, update với WHERE status = 'CHECKED_IN'
// ✅ Với ownership verification và per-event config priority
func (uc *StaffUseCase) processCheckout(ctx context.Context, userID int, ticketID int, now time.Time) models.CheckoutResult {
	result := models.CheckoutResult{
		TicketID: ticketID,
		Success:  false,
	}

	// Lấy thông tin vé
	ticket, err := uc.staffRepo.GetTicketForCheckin(ctx, ticketID)
	if err != nil || ticket == nil {
		errMsg := "Không tìm thấy vé với ID: " + strconv.Itoa(ticketID)
		result.Error = &errMsg
		return result
	}

	// ✅ Kiểm tra ownership (chỉ Organizer sở hữu sự kiện mới quét được)
	isOwner, err := uc.staffRepo.VerifyEventOwnership(ctx, userID, ticket.EventID)
	if err != nil || !isOwner {
		errMsg := "Bạn không có quyền quét vé của sự kiện này"
		result.Error = &errMsg
		return result
	}

	result.EventName = &ticket.EventName
	result.CustomerName = &ticket.CustomerName
	result.SeatCode = ticket.SeatCode
	result.TicketCode = &ticket.TicketCode

	// Kiểm tra trạng thái vé - phải đã check-in
	if ticket.Status != "CHECKED_IN" {
		var errMsg string
		switch ticket.Status {
		case "BOOKED":
			errMsg = fmt.Sprintf("Vé của %s chưa được check-in", ticket.CustomerName)
		case "CHECKED_OUT":
			checkOutTimeStr := "lúc đó"
			if ticket.CheckOutTime != nil {
				checkOutTimeStr = ticket.CheckOutTime.Format("15:04 02/01")
			}
			errMsg = fmt.Sprintf("🎫 Vé đã ra về!\nKhách %s đã check-out %s.\nVé không còn giá trị.", ticket.CustomerName, checkOutTimeStr)
			result.PreviousTime = &checkOutTimeStr
		case "CANCELLED":
			errMsg = fmt.Sprintf("Vé của %s đã bị hủy", ticket.CustomerName)
		default:
			errMsg = "Trạng thái vé không hợp lệ: " + ticket.Status
		}
		result.Error = &errMsg
		return result
	}

	// Kiểm tra thời gian (phải sau start_time + minMinutes)
	// ✅ Sử dụng per-event config nếu có, fallback to global
	minMinutes := config.GetEffectiveCheckoutOffset(ticket.EventCheckoutOffset)
	allowedTime := ticket.EventStartTime.Add(time.Duration(minMinutes) * time.Minute)
	if now.Before(allowedTime) {
		minutesRemaining := int(allowedTime.Sub(now).Minutes())
		errMsg := fmt.Sprintf("⚠️ Quá sớm! Check-out chỉ được phép từ %s.\n(Con %d phút nữa)\n\nSự kiện: %s\nKhách: %s",
			allowedTime.Format("15:04"),
			minutesRemaining,
			ticket.EventName,
			ticket.CustomerName)
		result.Error = &errMsg
		return result
	}

	// Kiểm tra sự kiện đã kết thúc chưa
	if now.After(ticket.EventEndTime) {
		errMsg := fmt.Sprintf("🚫 Sự kiện '%s' đã kết thúc.\nKhông thể check-in/out thêm.", ticket.EventName)
		result.Error = &errMsg
		return result
	}

	// Thực hiện check-out với optimistic locking (chống race condition)
	// Query chỉ update nếu status = 'CHECKED_IN', trả về rows affected
	rowsAffected, err := uc.staffRepo.UpdateTicketCheckout(ctx, ticketID)
	if err != nil {
		errMsg := "Lỗi khi cập nhật check-out"
		result.Error = &errMsg
		return result
	}

	// Nếu không có row nào được update => vé đã được check-out bởi request khác (race condition)
	if rowsAffected == 0 {
		errMsg := fmt.Sprintf("⏳ Thao tác đang được xử lý hoặc đã hoàn tất ở một máy khác.\nVui lòng kiểm tra lại.\n\nVé #%d | Khách: %s | Sự kiện: %s",
			ticketID, ticket.CustomerName, ticket.EventName)
		result.Error = &errMsg
		return result
	}

	result.Success = true
	msg := "Check-out thành công"
	result.Message = &msg
	checkOutTime := now.Format("15:04 02/01/2006")
	result.CheckOutTime = &checkOutTime

	return result
}

// parseTicketIDs parse mã vé từ QR
// Hỗ trợ nhiều format:
// 1. TICKETS:1,2,3 (Java backend - multi-ticket)
// 2. Single ticketId: "123"
// 3. TKT_eventId_seatId_billId (Go backend - cần query để lấy ticketId)
func (uc *StaffUseCase) parseTicketIDs(qrValue string) []int {
	ticketIDs := []int{}

	qrValue = strings.TrimSpace(qrValue)

	if strings.HasPrefix(qrValue, "TICKETS:") {
		// Multiple tickets: TICKETS:1,2,3
		idsPart := strings.TrimPrefix(qrValue, "TICKETS:")
		parts := strings.Split(idsPart, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				if id, err := strconv.Atoi(p); err == nil {
					ticketIDs = append(ticketIDs, id)
				}
			}
		}
	} else if strings.HasPrefix(qrValue, "TKT_") {
		// Go backend format: TKT_eventId_seatId_billId
		// Cần query DB để lấy ticketId từ format này
		var eventID, seatID, billID int
		_, err := fmt.Sscanf(qrValue, "TKT_%d_%d_%d", &eventID, &seatID, &billID)
		if err == nil && eventID > 0 && seatID > 0 && billID > 0 {
			// Query ticketId từ DB
			ticketID, queryErr := uc.staffRepo.GetTicketIDByQRCode(context.Background(), qrValue)
			if queryErr == nil && ticketID > 0 {
				ticketIDs = append(ticketIDs, ticketID)
			}
		}
	} else {
		// Single ticket ID (Java backend format)
		if id, err := strconv.Atoi(qrValue); err == nil {
			ticketIDs = append(ticketIDs, id)
		}
	}

	return ticketIDs
}

// ============================================================
// GetReports - Lấy danh sách report cho staff
// ============================================================
func (uc *StaffUseCase) GetReports(ctx context.Context) ([]models.ReportListResponse, error) {
	return uc.staffRepo.GetReportsForStaff(ctx)
}

// ============================================================
// GetReportDetail - Lấy chi tiết report cho staff
// ============================================================
func (uc *StaffUseCase) GetReportDetail(ctx context.Context, reportID int) (*models.ReportDetailResponse, error) {
	return uc.staffRepo.GetReportDetailForStaff(ctx, reportID)
}

// ============================================================
// GetSystemConfig - Lấy cấu hình hệ thống
// KHỚP VỚI Frontend SystemConfig.tsx GET /api/admin/config/system
// ============================================================
func (uc *StaffUseCase) GetSystemConfig(ctx context.Context) (*models.SystemConfigData, error) {
	checkinMinutes, err := uc.staffRepo.GetCheckinWindow(ctx)
	if err != nil {
		checkinMinutes = 60 // Default
	}

	checkoutMinutes, err := uc.staffRepo.GetCheckoutMinMinutes(ctx)
	if err != nil {
		checkoutMinutes = 60 // Default
	}

	return &models.SystemConfigData{
		MinMinutesAfterStart:             checkoutMinutes,
		CheckinAllowedBeforeStartMinutes: checkinMinutes,
	}, nil
}

// ============================================================
// UpdateSystemConfig - Cập nhật cấu hình hệ thống
// KHỚP VỚI Frontend SystemConfig.tsx POST /api/admin/config/system
// ============================================================
func (uc *StaffUseCase) UpdateSystemConfig(ctx context.Context, config models.SystemConfigData) error {
	// Update checkin window
	checkinValue := strconv.Itoa(config.CheckinAllowedBeforeStartMinutes)
	if err := uc.staffRepo.UpdateSystemConfig(ctx, "checkin_window_minutes", checkinValue); err != nil {
		return err
	}

	// Update checkout min minutes
	checkoutValue := strconv.Itoa(config.MinMinutesAfterStart)
	if err := uc.staffRepo.UpdateSystemConfig(ctx, "checkout_min_minutes_after_start", checkoutValue); err != nil {
		return err
	}

	return nil
}
