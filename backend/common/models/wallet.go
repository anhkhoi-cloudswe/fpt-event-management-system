package models

import "time"

// ============================================================
// Wallet Models - Phase 2: Data Isolation
//
// Mục đích: Tách biệt dữ liệu ví khỏi bảng Users
// Chiến lược: Dual-Write → đọc/ghi cả 2 bảng cho đến khi migrate xong
//
// Bảng mới:
//   - Wallet: balance, status, currency
//   - Wallet_Transaction: lịch sử giao dịch (CREDIT/DEBIT)
// ============================================================

// Wallet - Ví tiền của user (bảng mới, tách khỏi Users.Wallet)
type Wallet struct {
	WalletID  int       `json:"walletId" db:"wallet_id"`
	UserID    int       `json:"userId" db:"user_id"`
	Balance   float64   `json:"balance" db:"balance"`
	Currency  string    `json:"currency" db:"currency"`
	Status    string    `json:"status" db:"status"` // ACTIVE, FROZEN, CLOSED
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

// WalletTransaction - Lịch sử giao dịch ví
type WalletTransaction struct {
	TransactionID int       `json:"transactionId" db:"transaction_id"`
	WalletID      int       `json:"walletId" db:"wallet_id"`
	UserID        int       `json:"userId" db:"user_id"`
	Type          string    `json:"type" db:"type"` // CREDIT, DEBIT
	Amount        float64   `json:"amount" db:"amount"`
	BalanceBefore float64   `json:"balanceBefore" db:"balance_before"`
	BalanceAfter  float64   `json:"balanceAfter" db:"balance_after"`
	ReferenceType string    `json:"referenceType" db:"reference_type"` // TICKET_PURCHASE, TOPUP, REFUND
	ReferenceID   string    `json:"referenceId" db:"reference_id"`
	Description   string    `json:"description" db:"description"`
	CreatedAt     time.Time `json:"createdAt" db:"created_at"`
}

// ============================================================
// Internal API Request/Response DTOs
// ============================================================

// WalletDebitRequest - POST /internal/wallet/debit
type WalletDebitRequest struct {
	UserID        int     `json:"userId"`
	Amount        float64 `json:"amount"`
	ReferenceType string  `json:"referenceType"` // TICKET_PURCHASE
	ReferenceID   string  `json:"referenceId"`   // ticket_ids
	Description   string  `json:"description"`
}

// WalletCreditRequest - POST /internal/wallet/credit
type WalletCreditRequest struct {
	UserID        int     `json:"userId"`
	Amount        float64 `json:"amount"`
	ReferenceType string  `json:"referenceType"` // REFUND, TOPUP
	ReferenceID   string  `json:"referenceId"`   // report_id, bill_id
	Description   string  `json:"description"`
}

// WalletBalanceResponse - GET /internal/wallet/balance
type WalletBalanceResponse struct {
	UserID   int     `json:"userId"`
	Balance  float64 `json:"balance"`
	Currency string  `json:"currency"`
	Status   string  `json:"status"`
}

// WalletCheckResponse - GET /internal/wallet/check
type WalletCheckResponse struct {
	UserID     int     `json:"userId"`
	Balance    float64 `json:"balance"`
	Amount     float64 `json:"amount"`
	Sufficient bool    `json:"sufficient"`
}

// WalletTransactionResponse - Response cho debit/credit operations
type WalletTransactionResponse struct {
	Success       bool    `json:"success"`
	TransactionID int     `json:"transactionId,omitempty"`
	BalanceBefore float64 `json:"balanceBefore"`
	BalanceAfter  float64 `json:"balanceAfter"`
	Message       string  `json:"message"`
}

// ============================================================
// Saga Pattern DTOs - Phase 4: Distributed Transaction
//
// Flow: Reserve → Create Tickets → Confirm
// Compensation: Release (nếu bất kỳ bước nào thất bại)
//
// Reserve: Giữ tiền tạm thời (balance bị lock, chưa trừ thật)
// Confirm: Xác nhận trừ tiền (sau khi tạo vé thành công)
// Release: Hủy giữ tiền (nếu tạo vé thất bại → rollback)
// ============================================================

// WalletReserveRequest - POST /internal/wallet/reserve
// Giữ tạm một khoản tiền trong ví (chưa trừ thật)
type WalletReserveRequest struct {
	UserID        int     `json:"userId"`
	Amount        float64 `json:"amount"`
	ReferenceType string  `json:"referenceType"` // TICKET_PURCHASE
	ReferenceID   string  `json:"referenceId"`   // event_id:category_id
	Description   string  `json:"description"`
	TTLSeconds    int     `json:"ttlSeconds,omitempty"` // Thời gian giữ tiền (default: 300s = 5 phút)
}

// WalletReserveResponse - Response khi reserve thành công
type WalletReserveResponse struct {
	Success       bool    `json:"success"`
	ReservationID string  `json:"reservationId"` // UUID để track reservation
	UserID        int     `json:"userId"`
	Amount        float64 `json:"amount"`
	BalanceBefore float64 `json:"balanceBefore"`
	BalanceAfter  float64 `json:"balanceAfter"` // Balance sau khi giữ (= before - amount)
	ExpiresAt     string  `json:"expiresAt"`    // Thời điểm hết hạn reservation
	Message       string  `json:"message"`
}

// WalletConfirmRequest - POST /internal/wallet/confirm
// Xác nhận trừ tiền sau khi tạo vé thành công
type WalletConfirmRequest struct {
	ReservationID string `json:"reservationId"` // UUID từ ReserveResponse
	UserID        int    `json:"userId"`
	ReferenceID   string `json:"referenceId"` // ticket_ids (cập nhật sau khi tạo vé)
}

// WalletConfirmResponse - Response khi confirm thành công
type WalletConfirmResponse struct {
	Success       bool    `json:"success"`
	TransactionID int     `json:"transactionId,omitempty"`
	BalanceBefore float64 `json:"balanceBefore"`
	BalanceAfter  float64 `json:"balanceAfter"`
	Message       string  `json:"message"`
}

// WalletReleaseRequest - POST /internal/wallet/release
// Hủy reservation, trả tiền về ví (compensation)
type WalletReleaseRequest struct {
	ReservationID string `json:"reservationId"` // UUID từ ReserveResponse
	UserID        int    `json:"userId"`
	Reason        string `json:"reason"` // Lý do hủy (vd: "ticket_creation_failed")
}
