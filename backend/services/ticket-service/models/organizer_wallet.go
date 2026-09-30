package models

import (
	"time"
)

// ============================================================
// Organizer Wallet Models
// ============================================================

// OrganizerWalletResponse - Chi tiết số dư và trạng thái ví của Ban tổ chức
type OrganizerWalletResponse struct {
	WalletID         int     `json:"walletId"`
	UserID           int     `json:"userId"`
	AvailableBalance float64 `json:"availableBalance"` // Tương ứng cột balance trong DB
	PendingBalance   float64 `json:"pendingBalance"`   // Doanh thu tạm giữ chờ kết thúc sự kiện
	LifetimeEarnings float64 `json:"lifetimeEarnings"` // Tổng tiền đã kiếm được từ bán vé
	Currency         string  `json:"currency"`
	Status           string  `json:"status"`
}

// WalletTransactionItem - Bản ghi giao dịch trong sổ cái ví
type WalletTransactionItem struct {
	TransactionID int       `json:"transactionId"`
	WalletID      int       `json:"walletId"`
	UserID        int       `json:"userId"`
	Type          string    `json:"type"` // CREDIT, DEBIT, TOPUP, TICKET_SALE, COMMISSION_FEE, USAGE_FEE, WITHDRAWAL, EVENT_PAYOUT_RELEASE
	Amount        float64   `json:"amount"`
	BalanceBefore float64   `json:"balanceBefore"`
	BalanceAfter  float64   `json:"balanceAfter"`
	ReferenceType *string   `json:"referenceType"`
	ReferenceID   *string   `json:"referenceId"`
	Description   *string   `json:"description"`
	CreatedAt     time.Time `json:"createdAt"`
}

// PaginatedWalletTransactionsResponse - Danh sách giao dịch phân trang
type PaginatedWalletTransactionsResponse struct {
	Transactions []WalletTransactionItem `json:"transactions"`
	TotalRecords int                     `json:"totalRecords"`
	TotalPages   int                     `json:"totalPages"`
	CurrentPage  int                     `json:"currentPage"`
	Limit        int                     `json:"limit"`
}

// FinancialReceipt - Biên lai tài chính bất biến theo từng vé bán ra
type FinancialReceipt struct {
	ReceiptID           int       `json:"receiptId"`
	OrderID             int64     `json:"orderId"`
	BillID              *int      `json:"billId,omitempty"`
	TicketID            *int      `json:"ticketId,omitempty"`
	EventID             int       `json:"eventId"`
	OrganizerID         int       `json:"organizerId"`
	GrossAmount         float64   `json:"grossAmount"`
	SystemFeePercentage float64   `json:"systemFeePercentage"`
	FixedFee            float64   `json:"fixedFee"`
	CommissionAmount    float64   `json:"commissionAmount"`
	NetAmount           float64   `json:"netAmount"`
	Currency            string    `json:"currency"`
	CreatedAt           time.Time `json:"createdAt"`
}

// FinancialReportTicketClass - Báo cáo tài chính theo từng loại vé
type FinancialReportTicketClass struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	Name             string  `json:"name"`
	Price            float64 `json:"price"`
	QuantitySold     int     `json:"quantitySold"`
	GrossRevenue     float64 `json:"grossRevenue"`
	CommissionFee    float64 `json:"commissionFee"`
	NetRevenue       float64 `json:"netRevenue"`
}

// EventFinancialReportResponse - Báo cáo doanh thu và hoa hồng sự kiện
type EventFinancialReportResponse struct {
	EventID             int                          `json:"eventId"`
	Title               string                       `json:"title"`
	OrgType             string                       `json:"orgType"` // SCHOOL hoặc FREE
	Status              string                       `json:"status"`
	IsSettled           bool                         `json:"isSettled"`
	TotalTicketsSold    int                          `json:"totalTicketsSold"`
	GrossRevenue        float64                      `json:"grossRevenue"`
	TotalCommissionFee  float64                      `json:"totalCommissionFee"`
	NetRevenue          float64                      `json:"netRevenue"`
	FreeQuotaDeductions float64                      `json:"freeQuotaDeductions"`
	Currency            string                       `json:"currency"`
	TicketClasses       []FinancialReportTicketClass `json:"ticketClasses"`
}

// OrganizerBankAccount - Tài khoản ngân hàng thụ hưởng của Organizer
type OrganizerBankAccount struct {
	AccountID         int       `json:"accountId"`
	UserID            int       `json:"userId"`
	BankCode          string    `json:"bankCode"`
	BankName          string    `json:"bankName"`
	AccountNumber     string    `json:"accountNumber"`
	AccountHolderName string    `json:"accountHolderName"`
	IsVerified        bool      `json:"isVerified"`
	IsDefault         bool      `json:"isDefault"`
	CreatedAt         time.Time `json:"createdAt"`
}

// CreateBankAccountRequest - Body thêm tài khoản ngân hàng
type CreateBankAccountRequest struct {
	BankCode          string `json:"bankCode"`
	BankName          string `json:"bankName"`
	AccountNumber     string `json:"accountNumber"`
	AccountHolderName string `json:"accountHolderName"`
	IsDefault         bool   `json:"isDefault"`
}

// PayoutRequestItem - Bản ghi yêu cầu rút tiền
type PayoutRequestItem struct {
	PayoutID          int        `json:"payoutId"`
	UserID            int        `json:"userId"`
	BankAccountID     int        `json:"bankAccountId"`
	BankCode          string     `json:"bankCode"`
	BankName          string     `json:"bankName"`
	AccountNumber     string     `json:"accountNumber"`
	AccountHolderName string     `json:"accountHolderName"`
	Amount            float64    `json:"amount"`
	Status            string     `json:"status"` // PENDING, PROCESSING, COMPLETED, REJECTED
	Note              *string    `json:"note,omitempty"`
	RejectReason      *string    `json:"rejectReason,omitempty"`
	ProcessedAt       *time.Time `json:"processedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
}

// CreatePayoutRequest - Body gửi yêu cầu rút tiền
type CreatePayoutRequest struct {
	BankAccountID int     `json:"bankAccountId"`
	Amount        float64 `json:"amount"`
	Note          string  `json:"note"`
}

// TopupWalletRequest - Body yêu cầu nạp tiền ví
type TopupWalletRequest struct {
	Amount float64 `json:"amount"`
}

// TopupWalletResponse - Kết quả sinh thông tin nạp tiền QR PayOS / SePay
type TopupWalletResponse struct {
	OrderID         int64   `json:"orderId"`
	Amount          float64 `json:"amount"`
	Gateway         string  `json:"gateway,omitempty"`
	CheckoutURL     string  `json:"checkoutUrl,omitempty"`
	TransferContent string  `json:"transferContent"`
	BankCode        string  `json:"bankCode"`
	AccountNumber   string  `json:"accountNumber"`
	AccountName     string  `json:"accountName"`
	QRCodeURL       string  `json:"qrCodeUrl"`
}
