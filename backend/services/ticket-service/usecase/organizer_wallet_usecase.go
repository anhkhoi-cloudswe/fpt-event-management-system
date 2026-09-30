package usecase

import (
	"context"

	"github.com/fpt-event-services/services/ticket-service/models"
)

// ============================================================
// Organizer Wallet UseCase Methods
// ============================================================

// GetOrganizerWallet - Lấy thông tin số dư ví Organizer
func (uc *TicketUseCase) GetOrganizerWallet(ctx context.Context, userID int) (*models.OrganizerWalletResponse, error) {
	return uc.ticketRepo.GetOrganizerWallet(ctx, userID)
}

// GetOrganizerWalletTransactions - Lấy lịch sử giao dịch ví có phân trang
func (uc *TicketUseCase) GetOrganizerWalletTransactions(
	ctx context.Context,
	userID int,
	page, limit int,
	txType, startDate, endDate string,
) (*models.PaginatedWalletTransactionsResponse, error) {
	return uc.ticketRepo.GetOrganizerWalletTransactions(ctx, userID, page, limit, txType, startDate, endDate)
}

// GetEventFinancialReport - Lấy báo cáo doanh thu & hoa hồng chi tiết của sự kiện
func (uc *TicketUseCase) GetEventFinancialReport(ctx context.Context, organizerID, eventID int) (*models.EventFinancialReportResponse, error) {
	return uc.ticketRepo.GetEventFinancialReport(ctx, organizerID, eventID)
}

// CreateOrganizerTopupOrder - Khởi tạo lệnh nạp tiền vào ví Organizer
func (uc *TicketUseCase) CreateOrganizerTopupOrder(ctx context.Context, userID int, amount float64) (*models.TopupWalletResponse, error) {
	return uc.ticketRepo.CreateOrganizerTopupOrder(ctx, userID, amount)
}

// AddOrganizerBankAccount - Thêm tài khoản ngân hàng thụ hưởng cho Organizer
func (uc *TicketUseCase) AddOrganizerBankAccount(ctx context.Context, userID int, req models.CreateBankAccountRequest) (*models.OrganizerBankAccount, error) {
	return uc.ticketRepo.AddOrganizerBankAccount(ctx, userID, req)
}

// GetOrganizerBankAccounts - Lấy danh sách tài khoản ngân hàng thụ hưởng
func (uc *TicketUseCase) GetOrganizerBankAccounts(ctx context.Context, userID int) ([]models.OrganizerBankAccount, error) {
	return uc.ticketRepo.GetOrganizerBankAccounts(ctx, userID)
}

// RequestPayout - Tạo yêu cầu rút tiền về tài khoản ngân hàng
func (uc *TicketUseCase) RequestPayout(ctx context.Context, userID int, req models.CreatePayoutRequest) (*models.PayoutRequestItem, error) {
	return uc.ticketRepo.RequestPayout(ctx, userID, req)
}

// GetPayoutRequests - Lấy danh sách yêu cầu rút tiền phân trang
func (uc *TicketUseCase) GetPayoutRequests(ctx context.Context, userID int, page, limit int) ([]models.PayoutRequestItem, int, error) {
	return uc.ticketRepo.GetPayoutRequests(ctx, userID, page, limit)
}

// ReleaseEventPendingPayout - Giải phóng số dư tạm giữ của sự kiện sang số dư khả dụng khi FINISHED
func (uc *TicketUseCase) ReleaseEventPendingPayout(ctx context.Context, eventID int) error {
	return uc.ticketRepo.ReleaseEventPendingPayout(ctx, eventID)
}
