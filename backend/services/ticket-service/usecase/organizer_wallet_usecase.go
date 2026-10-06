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

// CreateOrganizerTopupOrder - Khởi tạo lệnh nạp tiền vào ví Organizer / mua gói
func (uc *TicketUseCase) CreateOrganizerTopupOrder(ctx context.Context, userID int, amount float64, tierCode ...string) (*models.TopupWalletResponse, error) {
	return uc.ticketRepo.CreateOrganizerTopupOrder(ctx, userID, amount, tierCode...)
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

// ============================================================
// Admin Financial Center UseCase Methods
// ============================================================

// GetAdminFinanceOverview - Lấy tổng quan 4 chỉ số KPI tài chính sàn
func (uc *TicketUseCase) GetAdminFinanceOverview(ctx context.Context) (*models.AdminFinanceOverviewResponse, error) {
	return uc.ticketRepo.GetAdminFinanceOverview(ctx)
}

// GetAdminPayouts - Lấy danh sách yêu cầu rút tiền phân trang cho Admin
func (uc *TicketUseCase) GetAdminPayouts(ctx context.Context, status string, page, limit int) (*models.AdminPayoutsResponse, error) {
	return uc.ticketRepo.GetAdminPayouts(ctx, status, page, limit)
}

// ProcessAdminPayout - Xử lý duyệt hoặc từ chối lệnh rút tiền
func (uc *TicketUseCase) ProcessAdminPayout(ctx context.Context, adminID int, payoutID int, req models.ProcessPayoutRequest) error {
	return uc.ticketRepo.ProcessAdminPayout(ctx, adminID, payoutID, req)
}

// GetAdminFinancialReceipts - Lấy danh sách biên lai tài chính phân trang cho Admin
func (uc *TicketUseCase) GetAdminFinancialReceipts(ctx context.Context, page, limit int, search string) (*models.AdminReceiptsResponse, error) {
	return uc.ticketRepo.GetAdminFinancialReceipts(ctx, page, limit, search)
}

// ExportAdminFinancialReceiptsCSV - Xuất CSV toàn bộ biên lai tài chính
func (uc *TicketUseCase) ExportAdminFinancialReceiptsCSV(ctx context.Context) ([]byte, error) {
	return uc.ticketRepo.ExportAdminFinancialReceiptsCSV(ctx)
}
