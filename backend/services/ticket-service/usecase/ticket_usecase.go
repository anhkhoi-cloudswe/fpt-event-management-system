package usecase

import (
	"context"
	"database/sql"
	"os"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/services/ticket-service/models"
	"github.com/fpt-event-services/services/ticket-service/repository"
)

type TicketUseCase struct {
	ticketRepo *repository.TicketRepository
}

// NewTicketUseCaseWithDB creates a new ticket use case with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewTicketUseCaseWithDB(dbConn *sql.DB) *TicketUseCase {
	return &TicketUseCase{
		ticketRepo: repository.NewTicketRepositoryWithDB(dbConn),
	}
}

// GetMyTickets - Lấy danh sách vé của user hiện tại
// Sử dụng API Composition (Microservices) khi USE_API_COMPOSITION=true
// Fallback: SQL JOIN cũ (Monolith) khi biến môi trường chưa bật
func (uc *TicketUseCase) GetMyTickets(ctx context.Context, userID int) ([]models.MyTicketResponse, error) {
	if os.Getenv("USE_API_COMPOSITION") == "true" {
		return uc.ticketRepo.GetTicketsByUserIDComposed(ctx, userID)
	}
	return uc.ticketRepo.GetTicketsByUserID(ctx, userID)
}

// GetMyTicketsPaginated - Lấy danh sách vé với pagination và search/filter
// Phase 4: Sử dụng API Composition khi TICKET_API_ENABLED=true
// Fallback: SQL JOIN cũ (Monolith) khi biến môi trường chưa bật
func (uc *TicketUseCase) GetMyTicketsPaginated(ctx context.Context, userID, page, limit int, search, status string) (*models.PaginatedTicketsResponse, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) {
		return uc.ticketRepo.GetTicketsByUserIDPaginatedComposed(ctx, userID, page, limit, search, status)
	}
	return uc.ticketRepo.GetTicketsByUserIDPaginated(ctx, userID, page, limit, search, status)
}

// GetTicketsByRole - Lấy danh sách vé theo role
// Phase 4: Sử dụng API Composition khi TICKET_API_ENABLED=true
// Fallback: SQL JOIN cũ (Monolith) khi biến môi trường chưa bật
func (uc *TicketUseCase) GetTicketsByRole(ctx context.Context, role string, userID int, eventID *int) ([]models.MyTicketResponse, error) {
	if config.IsFeatureEnabled(config.FlagTicketAPIEnabled) {
		return uc.ticketRepo.GetTicketsByRoleComposed(ctx, role, userID, eventID)
	}
	return uc.ticketRepo.GetTicketsByRole(ctx, role, userID, eventID)
}

// GetCategoryTickets - Lấy các loại vé của event
func (uc *TicketUseCase) GetCategoryTickets(ctx context.Context, eventID int) ([]models.CategoryTicket, error) {
	return uc.ticketRepo.GetCategoryTicketsByEventID(ctx, eventID)
}

// GetMyBills - Lấy danh sách hóa đơn của user
func (uc *TicketUseCase) GetMyBills(ctx context.Context, userID int) ([]models.MyBillResponse, error) {
	return uc.ticketRepo.GetBillsByUserID(ctx, userID)
}

// GetMyBillsPaginated - Lấy danh sách hóa đơn với pagination và search/filter
func (uc *TicketUseCase) GetMyBillsPaginated(ctx context.Context, userID, page, limit int, search, paymentStatus, paymentMethod string) (*models.PaginatedBillsResponse, error) {
	return uc.ticketRepo.GetBillsByUserIDPaginated(ctx, userID, page, limit, search, paymentStatus, paymentMethod)
}

// ============================================================
// MOMO PAYMENT METHODS
// ============================================================

// CreateMoMoPaymentURL - Tạo URL thanh toán MoMo cho nhiều ghế
func (uc *TicketUseCase) CreateMoMoPaymentURL(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, redirectURL, ipnURL string) (string, error) {
	return uc.ticketRepo.CreateMoMoPaymentURL(ctx, userID, eventID, categoryTicketID, seatIDs, redirectURL, ipnURL)
}

// ProcessMoMoWebhook - Xử lý webhook từ MoMo
func (uc *TicketUseCase) ProcessMoMoWebhook(ctx context.Context, payload map[string]interface{}) (string, error) {
	return uc.ticketRepo.ProcessMoMoWebhook(ctx, payload)
}

// ============================================================
// WALLET PAYMENT METHODS
// Get balance, calculate price, process wallet payment
// ============================================================

// GetWalletBalance - Lấy số dư ví của user
// Phase 4: Sử dụng Wallet API khi SAGA_ENABLED=true
// Fallback: SELECT từ bảng Wallet (single source of truth)
func (uc *TicketUseCase) GetWalletBalance(ctx context.Context, userID int) (float64, error) {
	if config.IsFeatureEnabled(config.FlagSagaEnabled) {
		return uc.ticketRepo.GetUserWalletBalanceViaAPI(ctx, userID)
	}
	return uc.ticketRepo.GetUserWalletBalance(ctx, userID)
}

// CalculateSeatsPriceForWallet - Tính tổng giá cho các ghế
func (uc *TicketUseCase) CalculateSeatsPriceForWallet(ctx context.Context, eventID int, seatIDs []int) (int, error) {
	return uc.ticketRepo.CalculateSeatsTotal(ctx, eventID, seatIDs)
}

// ProcessWalletPayment - Xử lý thanh toán bằng ví
// Phase 4: Sử dụng Saga Pattern khi SAGA_ENABLED=true
//
//	Saga Flow: Reserve → Create Tickets → Confirm
//	Compensation: Release nếu fail
//
// Fallback: Monolith (1 SQL transaction) khi chưa bật
func (uc *TicketUseCase) ProcessWalletPayment(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, amount int) (string, error) {
	if config.IsFeatureEnabled(config.FlagSagaEnabled) {
		return uc.ticketRepo.ProcessWalletPaymentSaga(ctx, userID, eventID, categoryTicketID, seatIDs, amount)
	}
	return uc.ticketRepo.ProcessWalletPayment(ctx, userID, eventID, categoryTicketID, seatIDs, amount)
}

// ============================================================
// WALLET TOPUP METHODS
// Get topup payment URL, process topup callback
// ============================================================

// CreateBankTransferOrder - Tạo đơn hàng thanh toán chuyển khoản ngân hàng (SePay)
func (uc *TicketUseCase) CreateBankTransferOrder(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int) (int64, float64, error) {
	return uc.ticketRepo.CreateBankTransferOrder(ctx, userID, eventID, categoryTicketID, seatIDs)
}

// ProcessSePayWebhook - Xử lý webhook thanh toán từ SePay
func (uc *TicketUseCase) ProcessSePayWebhook(ctx context.Context, gateway string, amount float64, content string, transferAt string) (string, error) {
	return uc.ticketRepo.ProcessSePayWebhook(ctx, gateway, amount, content, transferAt)
}

// GetPaymentStatus - Lấy trạng thái thanh toán của Bill (SePay)
func (uc *TicketUseCase) GetPaymentStatus(ctx context.Context, orderID int64) (string, error) {
	return uc.ticketRepo.GetPaymentStatus(ctx, orderID)
}

// CancelOrder - Chủ động hủy đơn hàng và giải phóng ghế lập tức
func (uc *TicketUseCase) CancelOrder(ctx context.Context, orderID int64) error {
	return uc.ticketRepo.CancelBankTransferOrder(ctx, orderID)
}

