package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
	walletModels "github.com/fpt-event-services/common/models"
	"github.com/fpt-event-services/common/timeutil"
	"github.com/fpt-event-services/common/utils"
)

// ============================================================
// Wallet Internal Handler - APIs nội bộ cho Wallet Service
//
// Microservice Isolation: Chỉ sử dụng bảng Wallet (single source of truth)
// Users.Wallet column do Auth Service quản lý thông qua API
//
// Các API này KHÔNG được expose ra ngoài (Frontend không gọi):
//   1. GET  /internal/wallet/balance?userId=  → Lấy số dư ví từ bảng Wallet
//   2. GET  /internal/wallet/check?userId=&amount= → Kiểm tra số dư đủ không
//   3. POST /internal/wallet/debit            → Trừ tiền (mua vé)
//   4. POST /internal/wallet/credit           → Cộng tiền (hoàn tiền, nạp)
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// WalletInternalHandler xử lý các request nội bộ cho wallet operations
type WalletInternalHandler struct {
	db     *sql.DB
	logger *logger.Logger
}

// NewWalletInternalHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewWalletInternalHandlerWithDB(dbConn *sql.DB) *WalletInternalHandler {
	ensureWalletIdempotencySchema(dbConn)
	return &WalletInternalHandler{
		db:     dbConn,
		logger: logger.Default(),
	}
}

func ensureWalletIdempotencySchema(dbConn *sql.DB) {
	if dbConn == nil {
		return
	}
	_, _ = dbConn.Exec(`CREATE TABLE IF NOT EXISTS idempotency_keys (
		idempotency_key VARCHAR(255) PRIMARY KEY,
		user_id VARCHAR(255) NOT NULL,
		request_hash VARCHAR(64) NOT NULL,
		response_code INT NOT NULL DEFAULT 0,
		response_body TEXT NOT NULL DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	)`)
	_, _ = dbConn.Exec(`ALTER TABLE wallet_transaction ADD CONSTRAINT uniq_wallet_tx_reference_id UNIQUE (reference_id)`)
}

// ============================================================
//  1. HandleGetBalance - GET /internal/wallet/balance?userId=
//     Lấy số dư ví từ bảng Wallet (single source of truth)
//     Nếu chưa có wallet → tạo mới với balance = 0
//
// ============================================================
func (h *WalletInternalHandler) HandleGetBalance(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	userIDStr := request.QueryStringParameters["userId"]
	if userIDStr == "" {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "userId required"})
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid userId"})
	}

	// Get from Wallet table (single source of truth)
	var balance float64
	var currency, status string
	query := `SELECT balance, currency, status FROM Wallet WHERE user_id = $1`
	err = h.db.QueryRowContext(ctx, query, userID).Scan(&balance, &currency, &status)

	if err == sql.ErrNoRows {
		// Wallet record chưa tồn tại → tạo mới với balance = 0
		h.logger.Info("[WALLET_INTERNAL] No wallet record for user %d, creating with balance 0", userID)

		// Create wallet record with 0 balance
		_, err = h.db.ExecContext(ctx,
			"INSERT INTO Wallet (user_id, balance, currency, status) VALUES ($1, 0, 'VND', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING",
			userID,
		)
		if err != nil {
			h.logger.Warn("[WALLET_INTERNAL] Failed to create wallet for user %d: %v", userID, err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to create wallet"})
		}

		balance = 0
		currency = "VND"
		status = "ACTIVE"
		h.logger.Info("[WALLET_INTERNAL] ✅ Created wallet for user %d with balance 0", userID)
	} else if err != nil {
		h.logger.Warn("[WALLET_INTERNAL] Failed to get wallet for user %d: %v", userID, err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to get balance"})
	}

	resp := walletModels.WalletBalanceResponse{
		UserID:   userID,
		Balance:  balance,
		Currency: currency,
		Status:   status,
	}

	h.logger.Info("[WALLET_INTERNAL] ✅ GetBalance: userId=%d, balance=%.2f", userID, balance)
	return createWalletResponse(http.StatusOK, resp)
}

// ============================================================
//  2. HandleCheckBalance - GET /internal/wallet/check?userId=&amount=
//     Kiểm tra user có đủ số dư không
//     Dùng trước khi ProcessWalletPayment
//
// ============================================================
func (h *WalletInternalHandler) HandleCheckBalance(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	userIDStr := request.QueryStringParameters["userId"]
	amountStr := request.QueryStringParameters["amount"]

	if userIDStr == "" || amountStr == "" {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "userId and amount required"})
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid userId"})
	}

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid amount"})
	}

	// Get balance from Wallet table (single source of truth)
	var balance float64
	query := `SELECT balance FROM Wallet WHERE user_id = $1`
	err = h.db.QueryRowContext(ctx, query, userID).Scan(&balance)
	if err != nil {
		if err == sql.ErrNoRows {
			// No wallet record → create with 0 balance
			h.db.ExecContext(ctx, "INSERT INTO Wallet (user_id, balance, currency, status) VALUES ($1, 0, 'VND', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING", userID)
			balance = 0
		} else {
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to check balance"})
		}
	}

	resp := walletModels.WalletCheckResponse{
		UserID:     userID,
		Balance:    balance,
		Amount:     amount,
		Sufficient: balance >= amount,
	}

	h.logger.Info("[WALLET_INTERNAL] ✅ CheckBalance: userId=%d, balance=%.2f, amount=%.2f, sufficient=%v",
		userID, balance, amount, resp.Sufficient)
	return createWalletResponse(http.StatusOK, resp)
}

// ============================================================
//  3. HandleDebit - POST /internal/wallet/debit
//     Trừ tiền ví (mua vé, thanh toán)
//     Wallet table is single source of truth
//     Transaction: SELECT FOR UPDATE → check balance → debit → log
//
// ============================================================
func (h *WalletInternalHandler) HandleDebit(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req walletModels.WalletDebitRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.UserID <= 0 || req.Amount <= 0 {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "userId and amount must be positive"})
	}

	return h.withIdempotency(ctx, request, strconv.Itoa(req.UserID), func() (events.APIGatewayProxyResponse, error) {

		// Start transaction with REPEATABLE READ (same as ProcessWalletPayment)
		tx, err := h.db.BeginTx(ctx, &sql.TxOptions{
			Isolation: sql.LevelRepeatableRead,
			ReadOnly:  false,
		})
		if err != nil {
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to start transaction"})
		}
		defer tx.Rollback()

		// Ensure wallet record exists (on-demand migration)
		h.ensureWalletExists(ctx, tx, req.UserID)

		// Lock wallet row and get current balance
		var walletID int
		var currentBalance float64
		lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
		err = tx.QueryRowContext(ctx, lockQuery, req.UserID).Scan(&walletID, &currentBalance)
		if err != nil {
			h.logger.Warn("[WALLET_DEBIT] Failed to lock wallet for user %d: %v", req.UserID, err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to lock wallet"})
		}

		// Check sufficient balance
		if currentBalance < req.Amount {
			h.logger.Info("[WALLET_DEBIT] Insufficient balance: user=%d, balance=%.2f, amount=%.2f",
				req.UserID, currentBalance, req.Amount)
			return createWalletResponse(http.StatusBadRequest, walletModels.WalletTransactionResponse{
				Success:       false,
				BalanceBefore: currentBalance,
				BalanceAfter:  currentBalance,
				Message:       fmt.Sprintf("insufficient_balance|%d|%.0f", int(req.Amount-currentBalance), currentBalance),
			})
		}

		newBalance := currentBalance - req.Amount

		// Update Wallet table (single source of truth)
		_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = $1 WHERE wallet_id = $2", newBalance, walletID)
		if err != nil {
			h.logger.Warn("[WALLET_DEBIT] Failed to update Wallet table: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to debit"})
		}

		// Log transaction
		txResult, err := tx.ExecContext(ctx,
			`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES ($1, $2, 'DEBIT', $3, $4, $5, $6, $7, $8)`,
			walletID, req.UserID, req.Amount, currentBalance, newBalance,
			req.ReferenceType, req.ReferenceID, req.Description,
		)
		if err != nil {
			h.logger.Warn("[WALLET_DEBIT] Failed to log transaction: %v", err)
			// Continue - debit succeeded, logging is best-effort
		}

		var transactionID int64
		if txResult != nil {
			transactionID, _ = txResult.LastInsertId()
		}

		// Commit
		if err := tx.Commit(); err != nil {
			h.logger.Warn("[WALLET_DEBIT] Failed to commit: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to commit"})
		}

		h.logger.Info("[WALLET_DEBIT] ✅ Debit success: user=%d, amount=%.2f, before=%.2f, after=%.2f, txID=%d",
			req.UserID, req.Amount, currentBalance, newBalance, transactionID)

		return createWalletResponse(http.StatusOK, walletModels.WalletTransactionResponse{
			Success:       true,
			TransactionID: int(transactionID),
			BalanceBefore: currentBalance,
			BalanceAfter:  newBalance,
			Message:       "debit successful",
		})
	})
}

// ============================================================
//  4. HandleCredit - POST /internal/wallet/credit
//     Cộng tiền ví (hoàn tiền, nạp tiền)
//     Wallet table is single source of truth
//
// ============================================================
func (h *WalletInternalHandler) HandleCredit(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req walletModels.WalletCreditRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.UserID <= 0 || req.Amount <= 0 {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "userId and amount must be positive"})
	}

	return h.withIdempotency(ctx, request, strconv.Itoa(req.UserID), func() (events.APIGatewayProxyResponse, error) {

		// Start transaction
		tx, err := h.db.BeginTx(ctx, &sql.TxOptions{
			Isolation: sql.LevelRepeatableRead,
			ReadOnly:  false,
		})
		if err != nil {
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to start transaction"})
		}
		defer tx.Rollback()

		// Ensure wallet record exists (on-demand migration)
		h.ensureWalletExists(ctx, tx, req.UserID)

		// Lock wallet row and get current balance
		var walletID int
		var currentBalance float64
		lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
		err = tx.QueryRowContext(ctx, lockQuery, req.UserID).Scan(&walletID, &currentBalance)
		if err != nil {
			h.logger.Warn("[WALLET_CREDIT] Failed to lock wallet for user %d: %v", req.UserID, err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to lock wallet"})
		}

		newBalance := currentBalance + req.Amount

		// Update Wallet table (single source of truth)
		_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = $1 WHERE wallet_id = $2", newBalance, walletID)
		if err != nil {
			h.logger.Warn("[WALLET_CREDIT] Failed to update Wallet table: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to credit"})
		}

		// Log transaction
		txResult, err := tx.ExecContext(ctx,
			`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES ($1, $2, 'CREDIT', $3, $4, $5, $6, $7, $8)`,
			walletID, req.UserID, req.Amount, currentBalance, newBalance,
			req.ReferenceType, req.ReferenceID, req.Description,
		)
		if err != nil {
			h.logger.Warn("[WALLET_CREDIT] Failed to log transaction: %v", err)
		}

		var transactionID int64
		if txResult != nil {
			transactionID, _ = txResult.LastInsertId()
		}

		// Commit
		if err := tx.Commit(); err != nil {
			h.logger.Warn("[WALLET_CREDIT] Failed to commit: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to commit"})
		}

		h.logger.Info("[WALLET_CREDIT] ✅ Credit success: user=%d, amount=%.2f, before=%.2f, after=%.2f, txID=%d",
			req.UserID, req.Amount, currentBalance, newBalance, transactionID)

		return createWalletResponse(http.StatusOK, walletModels.WalletTransactionResponse{
			Success:       true,
			TransactionID: int(transactionID),
			BalanceBefore: currentBalance,
			BalanceAfter:  newBalance,
			Message:       "credit successful",
		})
	})
}

// ============================================================
// SAGA PATTERN HANDLERS - Phase 4: Distributed Transaction
//
// Flow: Reserve → (Create Tickets) → Confirm
// Compensation: Release (nếu bất kỳ bước nào thất bại)
//
//  5. POST /internal/wallet/reserve  → Giữ tiền tạm (chưa trừ thật)
//  6. POST /internal/wallet/confirm  → Xác nhận trừ tiền
//  7. POST /internal/wallet/release  → Hủy giữ tiền (compensation/rollback)
// ============================================================

// ============================================================
//  5. HandleReserve - POST /internal/wallet/reserve
//     Giữ tạm tiền trong ví (Saga Step 1)
//     - Lock balance, kiểm tra đủ tiền
//     - Trừ balance tạm thời (reserve = debit tạm)
//     - Tạo Wallet_Transaction với type = 'RESERVE' (PENDING status)
//     - Trả về reservationId (UUID) để dùng cho Confirm/Release
//
// ============================================================
func (h *WalletInternalHandler) HandleReserve(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req walletModels.WalletReserveRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.UserID <= 0 || req.Amount <= 0 {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "userId and amount must be positive"})
	}

	return h.withIdempotency(ctx, request, strconv.Itoa(req.UserID), func() (events.APIGatewayProxyResponse, error) {

		// Default TTL: 5 phút
		ttl := 300
		if req.TTLSeconds > 0 {
			ttl = req.TTLSeconds
		}

		// Generate reservation ID
		reservationID := generateUUID()
		expiresAt := timeutil.GetNow().Add(time.Duration(ttl) * time.Second)

		h.logger.Info("[SAGA_RESERVE] 🔒 Starting reserve: user=%d, amount=%.2f, reservationId=%s", req.UserID, req.Amount, reservationID)

		// Start transaction
		tx, err := h.db.BeginTx(ctx, &sql.TxOptions{
			Isolation: sql.LevelRepeatableRead,
			ReadOnly:  false,
		})
		if err != nil {
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to start transaction"})
		}
		defer tx.Rollback()

		// Ensure wallet record exists
		h.ensureWalletExists(ctx, tx, req.UserID)

		// Lock wallet row and get current balance
		var walletID int
		var currentBalance float64
		lockQuery := `SELECT wallet_id, balance FROM Wallet WHERE user_id = $1 FOR UPDATE`
		err = tx.QueryRowContext(ctx, lockQuery, req.UserID).Scan(&walletID, &currentBalance)
		if err != nil {
			h.logger.Warn("[SAGA_RESERVE] Failed to lock wallet for user %d: %v", req.UserID, err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to lock wallet"})
		}

		// Check sufficient balance
		if currentBalance < req.Amount {
			h.logger.Info("[SAGA_RESERVE] ❌ Insufficient balance: user=%d, balance=%.2f, amount=%.2f",
				req.UserID, currentBalance, req.Amount)
			return createWalletResponse(http.StatusBadRequest, walletModels.WalletReserveResponse{
				Success:       false,
				ReservationID: "",
				UserID:        req.UserID,
				Amount:        req.Amount,
				BalanceBefore: currentBalance,
				BalanceAfter:  currentBalance,
				Message:       fmt.Sprintf("insufficient_balance|%d|%.0f", int(req.Amount-currentBalance), currentBalance),
			})
		}

		newBalance := currentBalance - req.Amount

		// Trừ balance tạm thời (reserve = hold money)
		_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = $1 WHERE wallet_id = $2", newBalance, walletID)
		if err != nil {
			h.logger.Warn("[SAGA_RESERVE] Failed to update Wallet table: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to reserve"})
		}

		// Log reservation transaction (type = 'RESERVE', description chứa reservationId + expiresAt)
		reserveDesc := fmt.Sprintf("RESERVE:%s|expires:%s|%s", reservationID, expiresAt.Format(time.RFC3339), req.Description)
		_, err = tx.ExecContext(ctx,
			`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES ($1, $2, 'DEBIT', $3, $4, $5, $6, $7, $8)`,
			walletID, req.UserID, req.Amount, currentBalance, newBalance,
			req.ReferenceType, fmt.Sprintf("reserve:%s", reservationID), reserveDesc,
		)
		if err != nil {
			h.logger.Warn("[SAGA_RESERVE] Failed to log transaction: %v", err)
		}

		// Commit
		if err := tx.Commit(); err != nil {
			h.logger.Warn("[SAGA_RESERVE] Failed to commit: %v", err)
			return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to commit"})
		}

		h.logger.Info("[SAGA_RESERVE] ✅ Reserve success: user=%d, amount=%.2f, before=%.2f, after=%.2f, reservationId=%s",
			req.UserID, req.Amount, currentBalance, newBalance, reservationID)

		return createWalletResponse(http.StatusOK, walletModels.WalletReserveResponse{
			Success:       true,
			ReservationID: reservationID,
			UserID:        req.UserID,
			Amount:        req.Amount,
			BalanceBefore: currentBalance,
			BalanceAfter:  newBalance,
			ExpiresAt:     expiresAt.Format(time.RFC3339),
			Message:       "reserve successful",
		})
	})
}

// ============================================================
//  6. HandleConfirm - POST /internal/wallet/confirm
//     Xác nhận reservation → chuyển thành CONFIRMED (Saga Step 3)
//     - Cập nhật reference_id với ticket IDs thực tế
//     - Đánh dấu reservation là đã hoàn thành
//     - Tiền đã bị trừ từ bước Reserve → không cần trừ thêm
//
// ============================================================
func (h *WalletInternalHandler) HandleConfirm(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req walletModels.WalletConfirmRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.ReservationID == "" || req.UserID <= 0 {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "reservationId and userId required"})
	}

	h.logger.Info("[SAGA_CONFIRM] ✅ Confirming reservation: reservationId=%s, user=%d", req.ReservationID, req.UserID)

	// Tìm và cập nhật transaction record (reservation → confirmed)
	referenceID := fmt.Sprintf("reserve:%s", req.ReservationID)
	newReferenceID := fmt.Sprintf("confirmed:%s|tickets:%s", req.ReservationID, req.ReferenceID)

	result, err := h.db.ExecContext(ctx,
		`UPDATE Wallet_Transaction 
		 SET reference_id = $1, description = description || ' | CONFIRMED at ' || NOW()::text
		 WHERE user_id = $2 AND reference_id = $3 AND type = 'DEBIT'`,
		newReferenceID, req.UserID, referenceID,
	)
	if err != nil {
		h.logger.Warn("[SAGA_CONFIRM] Failed to update transaction: %v", err)
		// Non-critical: tiền đã bị trừ từ Reserve, chỉ cập nhật metadata
	}

	rowsAffected := int64(0)
	if result != nil {
		rowsAffected, _ = result.RowsAffected()
	}

	if rowsAffected == 0 {
		h.logger.Warn("[SAGA_CONFIRM] ⚠️ No reservation found for reservationId=%s, user=%d (may already be confirmed)",
			req.ReservationID, req.UserID)
	}

	// Get current balance for response
	var balance float64
	h.db.QueryRowContext(ctx, "SELECT COALESCE(balance, 0) FROM Wallet WHERE user_id = $1", req.UserID).Scan(&balance)

	h.logger.Info("[SAGA_CONFIRM] ✅ Confirm success: reservationId=%s, user=%d, currentBalance=%.2f",
		req.ReservationID, req.UserID, balance)

	return createWalletResponse(http.StatusOK, walletModels.WalletConfirmResponse{
		Success:       true,
		BalanceBefore: balance, // Already deducted at Reserve step
		BalanceAfter:  balance,
		Message:       "confirm successful",
	})
}

// ============================================================
//  7. HandleRelease - POST /internal/wallet/release
//     Hủy reservation → hoàn tiền về ví (Saga Compensation)
//     - Cộng lại tiền đã giữ vào balance
//     - Đánh dấu reservation là RELEASED
//     - Dùng khi tạo vé thất bại hoặc timeout
//
// ============================================================
func (h *WalletInternalHandler) HandleRelease(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isWalletInternalCall(request) {
		return createWalletResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	var req walletModels.WalletReleaseRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	if req.ReservationID == "" || req.UserID <= 0 {
		return createWalletResponse(http.StatusBadRequest, map[string]string{"error": "reservationId and userId required"})
	}

	h.logger.Info("[SAGA_RELEASE] 🔓 Releasing reservation: reservationId=%s, user=%d, reason=%s",
		req.ReservationID, req.UserID, req.Reason)

	// Start transaction
	tx, err := h.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  false,
	})
	if err != nil {
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to start transaction"})
	}
	defer tx.Rollback()

	// Tìm reservation transaction để biết số tiền cần hoàn
	referenceID := fmt.Sprintf("reserve:%s", req.ReservationID)
	var amount float64
	var walletID int
	err = tx.QueryRowContext(ctx,
		`SELECT wt.amount, wt.wallet_id 
		 FROM Wallet_Transaction wt 
		 WHERE wt.user_id = $1 AND wt.reference_id = $2 AND wt.type = 'DEBIT'`,
		req.UserID, referenceID,
	).Scan(&amount, &walletID)

	if err != nil {
		if err == sql.ErrNoRows {
			h.logger.Warn("[SAGA_RELEASE] ⚠️ No reservation found: reservationId=%s, user=%d (may already be released/confirmed)",
				req.ReservationID, req.UserID)
			return createWalletResponse(http.StatusOK, walletModels.WalletTransactionResponse{
				Success: true,
				Message: "reservation already released or confirmed",
			})
		}
		h.logger.Warn("[SAGA_RELEASE] Failed to find reservation: %v", err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to find reservation"})
	}

	// Lock wallet and get current balance
	var currentBalance float64
	err = tx.QueryRowContext(ctx, "SELECT balance FROM Wallet WHERE wallet_id = $1 FOR UPDATE", walletID).Scan(&currentBalance)
	if err != nil {
		h.logger.Warn("[SAGA_RELEASE] Failed to lock wallet: %v", err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to lock wallet"})
	}

	newBalance := currentBalance + amount

	// Cộng lại tiền vào Wallet (single source of truth)
	_, err = tx.ExecContext(ctx, "UPDATE Wallet SET balance = $1 WHERE wallet_id = $2", newBalance, walletID)
	if err != nil {
		h.logger.Warn("[SAGA_RELEASE] Failed to update Wallet: %v", err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to release"})
	}

	// Update reservation → RELEASED
	releasedRefID := fmt.Sprintf("released:%s", req.ReservationID)
	_, err = tx.ExecContext(ctx,
		`UPDATE Wallet_Transaction 
		 SET reference_id = $1, description = description || ' | RELEASED: ' || $2
		 WHERE user_id = $3 AND reference_id = $4 AND type = 'DEBIT'`,
		releasedRefID, req.Reason, req.UserID, referenceID,
	)
	if err != nil {
		h.logger.Warn("[SAGA_RELEASE] Failed to update reservation status: %v", err)
	}

	// Log refund transaction
	_, err = tx.ExecContext(ctx,
		`INSERT INTO Wallet_Transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
		 VALUES ($1, $2, 'CREDIT', $3, $4, $5, 'SAGA_RELEASE', $6, $7)`,
		walletID, req.UserID, amount, currentBalance, newBalance,
		fmt.Sprintf("release:%s", req.ReservationID),
		fmt.Sprintf("Saga compensation: %s", req.Reason),
	)
	if err != nil {
		h.logger.Warn("[SAGA_RELEASE] Failed to log release transaction: %v", err)
	}

	// Commit
	if err := tx.Commit(); err != nil {
		h.logger.Warn("[SAGA_RELEASE] Failed to commit: %v", err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "failed to commit"})
	}

	h.logger.Info("[SAGA_RELEASE] ✅ Release success: user=%d, amount=%.2f, before=%.2f, after=%.2f, reservationId=%s",
		req.UserID, amount, currentBalance, newBalance, req.ReservationID)

	return createWalletResponse(http.StatusOK, walletModels.WalletTransactionResponse{
		Success:       true,
		BalanceBefore: currentBalance,
		BalanceAfter:  newBalance,
		Message:       fmt.Sprintf("release successful, refunded %.2f", amount),
	})
}

// ============================================================
// Helper Functions
// ============================================================

// ensureWalletExists tạo wallet record nếu chưa tồn tại (balance = 0)
func (h *WalletInternalHandler) ensureWalletExists(ctx context.Context, tx *sql.Tx, userID int) {
	var exists bool
	tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM Wallet WHERE user_id = $1)", userID).Scan(&exists)
	if exists {
		return
	}

	// Create wallet record with 0 balance (Auth Service manages Users.Wallet via API)
	_, err := tx.ExecContext(ctx,
		"INSERT INTO Wallet (user_id, balance, currency, status) VALUES ($1, 0, 'VND', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING",
		userID,
	)
	if err != nil {
		h.logger.Warn("[WALLET_ENSURE] Failed to create wallet for user %d: %v", userID, err)
	} else {
		h.logger.Info("[WALLET_ENSURE] ✅ Created wallet for user %d with balance 0", userID)
	}
}

// isWalletInternalCall kiểm tra request có phải từ internal service không
func isWalletInternalCall(request events.APIGatewayProxyRequest) bool {
	return utils.IsValidInternalToken(request.Headers)
}

// generateUUID tạo UUID v4 sử dụng crypto/rand (không cần external dependency)
func (h *WalletInternalHandler) withIdempotency(
	ctx context.Context,
	request events.APIGatewayProxyRequest,
	userID string,
	next func() (events.APIGatewayProxyResponse, error),
) (events.APIGatewayProxyResponse, error) {
	key := strings.TrimSpace(headerValue(request.Headers, "Idempotency-Key"))
	if key == "" {
		return next()
	}

	hashBytes := sha256.Sum256([]byte(request.Body))
	requestHash := fmt.Sprintf("%x", hashBytes[:])

	var storedHash, storedBody string
	var storedCode int
	err := h.db.QueryRowContext(ctx,
		`SELECT request_hash, response_code, response_body FROM idempotency_keys WHERE idempotency_key = $1`,
		key,
	).Scan(&storedHash, &storedCode, &storedBody)
	if err == nil {
		if storedHash != requestHash {
			return createWalletResponse(http.StatusConflict, map[string]string{"error": "idempotency key reused with different payload"})
		}
		if storedCode > 0 {
			return events.APIGatewayProxyResponse{
				StatusCode: storedCode,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       storedBody,
			}, nil
		}
		return createWalletResponse(http.StatusConflict, map[string]string{"error": "idempotency request is already processing"})
	}
	if err != sql.ErrNoRows {
		h.logger.Warn("[IDEMPOTENCY] lookup failed for key %s: %v", key, err)
		return createWalletResponse(http.StatusInternalServerError, map[string]string{"error": "idempotency lookup failed"})
	}

	_, err = h.db.ExecContext(ctx,
		`INSERT INTO idempotency_keys (idempotency_key, user_id, request_hash, response_code, response_body)
		 VALUES ($1, $2, $3, 0, '')`,
		key, userID, requestHash,
	)
	if err != nil {
		return h.withIdempotency(ctx, request, userID, next)
	}

	resp, execErr := next()
	_, updateErr := h.db.ExecContext(ctx,
		`UPDATE idempotency_keys SET response_code = $1, response_body = $2 WHERE idempotency_key = $3`,
		resp.StatusCode, resp.Body, key,
	)
	if updateErr != nil {
		h.logger.Warn("[IDEMPOTENCY] failed to store response for key %s: %v", key, updateErr)
	}
	return resp, execErr
}

func headerValue(headers map[string]string, name string) string {
	for k, v := range headers {
		if strings.EqualFold(k, name) {
			return v
		}
	}
	return ""
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // Version 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// createWalletResponse tạo API Gateway response chuẩn
func createWalletResponse(statusCode int, body interface{}) (events.APIGatewayProxyResponse, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       `{"error":"failed to marshal response"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Body:       string(jsonBody),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
