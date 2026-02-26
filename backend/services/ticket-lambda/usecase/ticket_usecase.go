package usecase

import (
	"context"

	"github.com/fpt-event-services/services/ticket-lambda/models"
	"github.com/fpt-event-services/services/ticket-lambda/repository"
)

type TicketUseCase struct {
	ticketRepo *repository.TicketRepository
}

func NewTicketUseCase() *TicketUseCase {
	return &TicketUseCase{
		ticketRepo: repository.NewTicketRepository(),
	}
}

// GetMyTickets - Lấy danh sách vé của user hiện tại
func (uc *TicketUseCase) GetMyTickets(ctx context.Context, userID int) ([]models.MyTicketResponse, error) {
	return uc.ticketRepo.GetTicketsByUserID(ctx, userID)
}

// GetMyTicketsPaginated - Lấy danh sách vé với pagination và search/filter
func (uc *TicketUseCase) GetMyTicketsPaginated(ctx context.Context, userID, page, limit int, search, status string) (*models.PaginatedTicketsResponse, error) {
	return uc.ticketRepo.GetTicketsByUserIDPaginated(ctx, userID, page, limit, search, status)
}

// GetTicketsByRole - Lấy danh sách vé theo role
func (uc *TicketUseCase) GetTicketsByRole(ctx context.Context, role string, userID int, eventID *int) ([]models.MyTicketResponse, error) {
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
// VNPAY PAYMENT METHODS
// KHỚP VỚI Java PaymentService & BuyTicketService
// ============================================================

// CreatePaymentURL - Tạo URL thanh toán VNPay cho nhiều ghế
func (uc *TicketUseCase) CreatePaymentURL(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int) (string, error) {
	return uc.ticketRepo.CreateVNPayURL(ctx, userID, eventID, categoryTicketID, seatIDs)
}

// ProcessPaymentCallback - Xử lý callback từ VNPay
func (uc *TicketUseCase) ProcessPaymentCallback(ctx context.Context, amount, responseCode, orderInfo, txnRef, secureHash string) (string, error) {
	return uc.ticketRepo.ProcessVNPayCallback(ctx, amount, responseCode, orderInfo, txnRef, secureHash)
}

// ============================================================
// WALLET PAYMENT METHODS
// Get balance, calculate price, process wallet payment
// ============================================================

// GetWalletBalance - Lấy số dư ví của user
func (uc *TicketUseCase) GetWalletBalance(ctx context.Context, userID int) (float64, error) {
	return uc.ticketRepo.GetUserWalletBalance(ctx, userID)
}

// CalculateSeatsPriceForWallet - Tính tổng giá cho các ghế
func (uc *TicketUseCase) CalculateSeatsPriceForWallet(ctx context.Context, eventID int, seatIDs []int) (int, error) {
	return uc.ticketRepo.CalculateSeatsTotal(ctx, eventID, seatIDs)
}

// ProcessWalletPayment - Xử lý thanh toán bằng ví
func (uc *TicketUseCase) ProcessWalletPayment(ctx context.Context, userID, eventID, categoryTicketID int, seatIDs []int, amount int) (string, error) {
	return uc.ticketRepo.ProcessWalletPayment(ctx, userID, eventID, categoryTicketID, seatIDs, amount)
}

// ============================================================
// WALLET TOPUP METHODS
// Get topup payment URL, process topup callback
// ============================================================
