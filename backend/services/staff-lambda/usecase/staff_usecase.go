package usecase

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/services/staff-lambda/models"
	"github.com/fpt-event-services/services/staff-lambda/repository"
)

var log = logger.Default()

// StaffUseCase handles staff business logic
type StaffUseCase struct {
	staffRepo *repository.StaffRepository
}

// NewStaffUseCaseWithDB creates a new staff use case with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewStaffUseCaseWithDB(dbConn *sql.DB) *StaffUseCase {
	return &StaffUseCase{
		staffRepo: repository.NewStaffRepositoryWithDB(dbConn),
	}
}

// ============================================================
// CheckIn - Xử lý check-in vé
// KHỚP VỚI Java StaffCheckinController
// ✅ Với ownership verification
// ============================================================
func (uc *StaffUseCase) CheckIn(ctx context.Context, userID int, qrValue string) (*models.CheckinResponse, error) {
	log.Info("CheckIn - UserID=%d QR=%s", userID, qrValue)

	// Parse ticket IDs từ QR (hỗ trợ cả ticket_id và ticket_code)
	ticketIDs := uc.parseTicketIDs(qrValue)

	// ✅ Nếu không parse được ticket ID, thử tìm bằng ticket_code
	if len(ticketIDs) == 0 {
		log.Debug("CheckIn - cannot parse as ticketID, trying code=%s", qrValue)
		ticket, err := uc.staffRepo.GetTicketByCode(ctx, qrValue)
		if err == nil && ticket != nil {
			ticketIDs = append(ticketIDs, ticket.TicketID)
			log.Debug("CheckIn - found ticket by code: TicketID=%d Code=%s", ticket.TicketID, ticket.TicketCode)
		} else {
			log.Warn("CheckIn - ticket code not found: %s error=%v", qrValue, err)
		}
	}

	if len(ticketIDs) == 0 {
		errMsg := fmt.Sprintf("Không tìm thấy mã vé '%s'. Vui lòng kiểm tra lại QR code hoặc nhập đúng mã vé.", qrValue)
		log.Warn("CheckIn - %s", errMsg)
		return &models.CheckinResponse{
			Success: false,
			Message: errMsg,
		}, nil
	}

	log.Debug("CheckIn - found %d ticket(s): %v", len(ticketIDs), ticketIDs)

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

	log.Info("CheckIn - result Success=%d Fail=%d Message=%s", successCount, failCount, message)

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

	log.Debug("processCheckin - UserID=%d TicketID=%d", userID, ticketID)

	// Lấy thông tin vé
	ticket, err := uc.staffRepo.GetTicketForCheckin(ctx, ticketID)
	if err != nil {
		errCode := "DatabaseError"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Lỗi database khi tìm vé #%d: %v", ticketID, err)
		result.Error = &errMsg
		log.Error("processCheckin - %s", errMsg)
		return result
	}
	if ticket == nil {
		errCode := "InvalidTicket"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Mã vé không hợp lệ: Không tìm thấy vé #%d trong hệ thống", ticketID)
		result.Error = &errMsg
		log.Warn("processCheckin - %s", errMsg)
		return result
	}

	log.Debug("processCheckin - TicketID=%d Code=%s Status=%s Customer=%s EventID=%d",
		ticket.TicketID, ticket.TicketCode, ticket.Status, ticket.CustomerName, ticket.EventID)

	// ✅ Kiểm tra ownership (chỉ Organizer sở hữu sự kiện mới quét được)
	isOwner, err := uc.staffRepo.VerifyEventOwnership(ctx, userID, ticket.EventID)
	if err != nil {
		errMsg := fmt.Sprintf("Lỗi khi kiểm tra quyền sở hữu: %v", err)
		result.Error = &errMsg
		log.Error("processCheckin - ownership check error: %v", err)
		return result
	}
	if !isOwner {
		errCode := "UnauthorizedOrganizer"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Bạn không có quyền quét vé của sự kiện '%s' (EventID=%d). Chỉ Organizer tạo sự kiện mới được quét vé.",
			ticket.EventName, ticket.EventID)
		result.Error = &errMsg
		log.Warn("processCheckin - unauthorized UserID=%d EventID=%d", userID, ticket.EventID)
		return result
	}

	result.EventName = &ticket.EventName
	result.SeatCode = ticket.SeatCode
	result.TicketCode = &ticket.TicketCode

	// Kiểm tra trạng thái vé
	if ticket.Status == "CANCELLED" {
		errCode := "TicketCancelled"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("🚫 Vé #%d cỽa %s đã bị hủy, không thể check-in", ticketID, ticket.CustomerName)
		result.Error = &errMsg
		log.Warn("processCheckin - ticket CANCELLED TicketID=%d", ticketID)
		return result
	}

	if ticket.Status == "CHECKED_IN" {
		errCode := "AlreadyCheckedIn"
		result.ErrorCode = &errCode
		checkInTimeStr := "lúc đó"
		if ticket.CheckInTime != nil {
			checkInTimeStr = ticket.CheckInTime.Format("15:04 02/01")
		}
		errMsg := fmt.Sprintf("📢 Vé đã vào cổng!\nKhách %s đã check-in %s.\nVui lòng không cho vào lần 2!", ticket.CustomerName, checkInTimeStr)
		result.Error = &errMsg
		result.PreviousTime = &checkInTimeStr
		log.Warn("processCheckin - already CHECKED_IN TicketID=%d", ticketID)
		return result
	}

	if ticket.Status == "CHECKED_OUT" {
		errCode := "AlreadyCheckedOut"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("🎫 Vé đã ra về!\nKhách %s đã check-out.\nVé không còn giá trị.", ticket.CustomerName)
		result.Error = &errMsg
		log.Warn("processCheckin - ticket CHECKED_OUT TicketID=%d", ticketID)
		return result
	}

	if ticket.Status != "BOOKED" {
		errCode := "InvalidStatus"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Trạng thái vé không hợp lệ: %s (yêu cầu: BOOKED)", ticket.Status)
		result.Error = &errMsg
		log.Warn("processCheckin - invalid status=%s TicketID=%d", ticket.Status, ticketID)
		return result
	}
	log.Debug("processCheckin - status BOOKED TicketID=%d", ticketID)

	// Kiểm tra thời gian (cho phép check-in trước X phút)
	// ✅ Sử dụng per-event config nếu có, fallback to global
	checkinWindow := config.GetEffectiveCheckinOffset(ticket.EventCheckinOffset)
	allowedTime := ticket.EventStartTime.Add(-time.Duration(checkinWindow) * time.Minute)

	log.Debug("processCheckin - time check EventID=%d start=%s allowed=%s now=%s",
		ticket.EventID,
		ticket.EventStartTime.Format("15:04:05 02/01/2006 MST"),
		allowedTime.Format("15:04:05 02/01/2006 MST"),
		now.Format("15:04:05 02/01/2006 MST"),
	)

	if now.Before(allowedTime) {
		errCode := "TooEarlyToCheckIn"
		result.ErrorCode = &errCode
		minutesRemaining := int(allowedTime.Sub(now).Minutes())
		errMsg := fmt.Sprintf("Cổng check-in mở lúc %s (còn %d phút nữa).\nSự kiện: %s | Khách: %s",
			allowedTime.Format("15:04"),
			minutesRemaining,
			ticket.EventName,
			ticket.CustomerName)
		result.Error = &errMsg
		log.Info("processCheckin - too early TicketID=%d minutesRemaining=%d", ticketID, minutesRemaining)
		return result
	}

	// Kiểm tra sự kiện đã kết thúc chưa
	if now.After(ticket.EventEndTime) {
		errCode := "EventEnded"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Sự kiện '%s' đã kết thúc lúc %s. Không thể check-in thêm.",
			ticket.EventName, ticket.EventEndTime.Format("15:04 02/01"))
		result.Error = &errMsg
		log.Info("processCheckin - event ended TicketID=%d", ticketID)
		return result
	}

	// Thực hiện check-in với optimistic locking (chống race condition)
	// Query chỉ update nếu status = 'BOOKED', trả về rows affected
	rowsAffected, err := uc.staffRepo.UpdateTicketCheckin(ctx, ticketID)
	if err != nil {
		errCode := "DatabaseError"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Lỗi database khi cập nhật check-in: %v", err)
		result.Error = &errMsg
		log.Error("processCheckin - UpdateTicketCheckin error TicketID=%d: %v", ticketID, err)
		return result
	}

	// Nếu không có row nào được update => vé đã được check-in bởi request khác (race condition)
	if rowsAffected == 0 {
		errCode := "AlreadyCheckedIn"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Vé đã được xử lý ở một thiết bị khác. Vui lòng kiểm tra lại.\nVé #%d | Khách: %s | Sự kiện: %s",
			ticketID, ticket.CustomerName, ticket.EventName)
		result.Error = &errMsg
		log.Warn("processCheckin - race condition TicketID=%d rowsAffected=0", ticketID)
		return result
	}
	log.Info("processCheckin - success TicketID=%d Customer=%s", ticketID, ticket.CustomerName)

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
		errCode := "InvalidTicket"
		result.ErrorCode = &errCode
		errMsg := "Không tìm thấy vé với ID: " + strconv.Itoa(ticketID)
		result.Error = &errMsg
		return result
	}

	// ✅ Gán thông tin vé sớm để tất cả response đều có context
	result.EventName = &ticket.EventName
	result.CustomerName = &ticket.CustomerName
	result.SeatCode = ticket.SeatCode
	result.TicketCode = &ticket.TicketCode

	// ✅ Kiểm tra ownership: Chỉ Organizer tạo sự kiện mới quét được
	isOwner, err := uc.staffRepo.VerifyEventOwnership(ctx, userID, ticket.EventID)
	if err != nil || !isOwner {
		errCode := "UnauthorizedOrganizer"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Bạn không có quyền quét vé của sự kiện '%s'. Chỉ Organizer tạo sự kiện mới được quét vé.",
			ticket.EventName)
		result.Error = &errMsg
		return result
	}

	// ✅ Kiểm tra trạng thái vé - phải đã check-in mới cho check-out
	if ticket.Status != "CHECKED_IN" {
		switch ticket.Status {
		case "BOOKED":
			errCode := "NotCheckedIn"
			result.ErrorCode = &errCode
			errMsg := fmt.Sprintf("Khách %s chưa check-in, không thể check-out!", ticket.CustomerName)
			result.Error = &errMsg
		case "CHECKED_OUT":
			// ✅ Chống quét lại: Trả về errorCode rõ ràng để frontend phân biệt 'Vé đã ra về'
			errCode := "AlreadyCheckedOut"
			result.ErrorCode = &errCode
			checkOutTimeStr := "lúc đó"
			if ticket.CheckOutTime != nil {
				checkOutTimeStr = ticket.CheckOutTime.Format("15:04 02/01")
			}
			errMsg := fmt.Sprintf("Khách %s đã check-out lúc %s. Vé không còn giá trị.", ticket.CustomerName, checkOutTimeStr)
			result.Error = &errMsg
			result.PreviousTime = &checkOutTimeStr
		case "CANCELLED":
			errCode := "TicketCancelled"
			result.ErrorCode = &errCode
			errMsg := fmt.Sprintf("Vé của %s đã bị hủy.", ticket.CustomerName)
			result.Error = &errMsg
		default:
			errCode := "InvalidStatus"
			result.ErrorCode = &errCode
			errMsg := "Trạng thái vé không hợp lệ: " + ticket.Status
			result.Error = &errMsg
		}
		return result
	}

	// Kiểm tra thời gian (phải sau start_time + minMinutes)
	// ✅ Sử dụng per-event config nếu có, fallback to global
	minMinutes := config.GetEffectiveCheckoutOffset(ticket.EventCheckoutOffset)
	allowedTime := ticket.EventStartTime.Add(time.Duration(minMinutes) * time.Minute)
	if now.Before(allowedTime) {
		errCode := "TooEarlyToCheckOut"
		result.ErrorCode = &errCode
		minutesRemaining := int(allowedTime.Sub(now).Minutes())
		errMsg := fmt.Sprintf("Check-out chỉ được phép từ %s (còn %d phút nữa).\nSự kiện: %s | Khách: %s",
			allowedTime.Format("15:04"),
			minutesRemaining,
			ticket.EventName,
			ticket.CustomerName)
		result.Error = &errMsg
		return result
	}

	// Kiểm tra sự kiện đã kết thúc chưa
	if now.After(ticket.EventEndTime) {
		errCode := "EventEnded"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Sự kiện '%s' đã kết thúc. Không thể check-out thêm.", ticket.EventName)
		result.Error = &errMsg
		return result
	}

	// Thực hiện check-out với optimistic locking (chống race condition)
	// Query chỉ update nếu status = 'CHECKED_IN', trả về rows affected
	rowsAffected, err := uc.staffRepo.UpdateTicketCheckout(ctx, ticketID)
	if err != nil {
		errCode := "DatabaseError"
		result.ErrorCode = &errCode
		errMsg := "Lỗi khi cập nhật check-out"
		result.Error = &errMsg
		return result
	}

	// Nếu không có row nào được update => vé đã được check-out bởi request khác (race condition)
	if rowsAffected == 0 {
		errCode := "AlreadyCheckedOut"
		result.ErrorCode = &errCode
		errMsg := fmt.Sprintf("Vé đã được xử lý ở một thiết bị khác. Vui lòng kiểm tra lại.\nVé #%d | Khách: %s | Sự kiện: %s",
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
