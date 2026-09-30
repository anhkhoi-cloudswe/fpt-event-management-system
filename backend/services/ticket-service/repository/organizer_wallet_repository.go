package repository

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"math"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/services/ticket-service/models"
	ticketutils "github.com/fpt-event-services/services/ticket-service/utils"
)

// ============================================================
// Organizer Wallet Repository Methods
// ============================================================

// GetOrganizerWallet - Lấy thông tin số dư ví của Ban tổ chức
func (r *TicketRepository) GetOrganizerWallet(ctx context.Context, userID int) (*models.OrganizerWalletResponse, error) {
	log := logger.Default().WithContext(ctx)

	var wallet models.OrganizerWalletResponse
	query := `
		SELECT wallet_id, user_id, balance, pending_balance, currency, status
		FROM wallet
		WHERE user_id = $1
	`
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&wallet.WalletID,
		&wallet.UserID,
		&wallet.AvailableBalance,
		&wallet.PendingBalance,
		&wallet.Currency,
		&wallet.Status,
	)

	if err == sql.ErrNoRows {
		// Tự động khởi tạo ví nếu chưa có
		insertQuery := `
			INSERT INTO wallet (user_id, balance, pending_balance, currency, status)
			VALUES ($1, 0.00, 0.00, 'VND', 'ACTIVE')
			RETURNING wallet_id, user_id, balance, pending_balance, currency, status
		`
		err = r.db.QueryRowContext(ctx, insertQuery, userID).Scan(
			&wallet.WalletID,
			&wallet.UserID,
			&wallet.AvailableBalance,
			&wallet.PendingBalance,
			&wallet.Currency,
			&wallet.Status,
		)
		if err != nil {
			log.Error("Failed to auto-create organizer wallet", "user_id", userID, "error", err)
			return nil, fmt.Errorf("không thể khởi tạo ví: %w", err)
		}
	} else if err != nil {
		log.Error("Failed to query organizer wallet", "user_id", userID, "error", err)
		return nil, fmt.Errorf("lỗi truy vấn ví: %w", err)
	}

	// Tính tổng doanh thu tích lũy trọn đời (Lifetime Earnings) từ bảng financial_receipt
	var lifetime float64
	earningsQuery := `
		SELECT COALESCE(SUM(net_amount), 0.00)
		FROM financial_receipt
		WHERE organizer_id = $1
	`
	_ = r.db.QueryRowContext(ctx, earningsQuery, userID).Scan(&lifetime)
	wallet.LifetimeEarnings = lifetime

	return &wallet, nil
}

// GetOrganizerWalletTransactions - Lấy lịch sử giao dịch ví của Organizer có phân trang và bộ lọc
func (r *TicketRepository) GetOrganizerWalletTransactions(
	ctx context.Context,
	userID int,
	page, limit int,
	txType, startDate, endDate string,
) (*models.PaginatedWalletTransactionsResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	whereClause := "WHERE user_id = $1"
	args := []interface{}{userID}
	argIdx := 2

	if txType != "" {
		whereClause += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, txType)
		argIdx++
	}
	if startDate != "" {
		whereClause += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, startDate)
		argIdx++
	}
	if endDate != "" {
		whereClause += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, endDate)
		argIdx++
	}

	// Đếm tổng số bản ghi
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM wallet_transaction %s", whereClause)
	var totalRecords int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords); err != nil {
		return nil, fmt.Errorf("lỗi đếm giao dịch ví: %w", err)
	}

	// Truy vấn danh sách
	listQuery := fmt.Sprintf(`
		SELECT transaction_id, wallet_id, user_id, type, amount,
		       balance_before, balance_after, reference_type, reference_id, description, created_at
		FROM wallet_transaction
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, listQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn danh sách giao dịch ví: %w", err)
	}
	defer rows.Close()

	transactions := make([]models.WalletTransactionItem, 0)
	for rows.Next() {
		var item models.WalletTransactionItem
		err := rows.Scan(
			&item.TransactionID,
			&item.WalletID,
			&item.UserID,
			&item.Type,
			&item.Amount,
			&item.BalanceBefore,
			&item.BalanceAfter,
			&item.ReferenceType,
			&item.ReferenceID,
			&item.Description,
			&item.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("lỗi đọc bản ghi giao dịch: %w", err)
		}
		transactions = append(transactions, item)
	}

	totalPages := int(math.Ceil(float64(totalRecords) / float64(limit)))

	return &models.PaginatedWalletTransactionsResponse{
		Transactions: transactions,
		TotalRecords: totalRecords,
		TotalPages:   totalPages,
		CurrentPage:  page,
		Limit:        limit,
	}, nil
}

// GetEventFinancialReport - Báo cáo tài chính chi tiết của một sự kiện
func (r *TicketRepository) GetEventFinancialReport(ctx context.Context, organizerID, eventID int) (*models.EventFinancialReportResponse, error) {
	// 1. Kiểm tra sự kiện và quyền sở hữu
	var report models.EventFinancialReportResponse
	var createdBy int
	eventQuery := `
		SELECT event_id, title, org_type, status, COALESCE(is_settled, FALSE), created_by
		FROM event
		WHERE event_id = $1
	`
	err := r.db.QueryRowContext(ctx, eventQuery, eventID).Scan(
		&report.EventID,
		&report.Title,
		&report.OrgType,
		&report.Status,
		&report.IsSettled,
		&createdBy,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("không tìm thấy sự kiện ID %d", eventID)
	} else if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn sự kiện: %w", err)
	}

	if organizerID > 0 && createdBy != organizerID {
		return nil, fmt.Errorf("bạn không có quyền xem báo cáo tài chính của sự kiện này")
	}

	report.Currency = "VND"

	// 2. Tính tổng doanh thu và phí từ financial_receipt
	receiptSummaryQuery := `
		SELECT COUNT(*),
		       COALESCE(SUM(gross_amount), 0.00),
		       COALESCE(SUM(commission_amount), 0.00),
		       COALESCE(SUM(net_amount), 0.00)
		FROM financial_receipt
		WHERE event_id = $1
	`
	_ = r.db.QueryRowContext(ctx, receiptSummaryQuery, eventID).Scan(
		&report.TotalTicketsSold,
		&report.GrossRevenue,
		&report.TotalCommissionFee,
		&report.NetRevenue,
	)

	// 3. Tính chi phí hạn ngạch miễn phí đã bị trừ (nếu có)
	freeDeductionQuery := `
		SELECT COALESCE(SUM(amount), 0.00)
		FROM wallet_transaction
		WHERE user_id = $1 AND reference_type = 'FREE_EVENT_QUOTA' AND reference_id = $2
	`
	_ = r.db.QueryRowContext(ctx, freeDeductionQuery, createdBy, strconv.Itoa(eventID)).Scan(&report.FreeQuotaDeductions)

	// 4. Chi tiết từng loại vé (Ticket Classes)
	ticketClassQuery := `
		SELECT ct.category_ticket_id,
		       ct.name,
		       ct.price,
		       COUNT(fr.receipt_id) AS qty_sold,
		       COALESCE(SUM(fr.gross_amount), 0.00) AS gross,
		       COALESCE(SUM(fr.commission_amount), 0.00) AS commission,
		       COALESCE(SUM(fr.net_amount), 0.00) AS net
		FROM category_ticket ct
		LEFT JOIN ticket t ON t.category_ticket_id = ct.category_ticket_id AND t.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
		LEFT JOIN financial_receipt fr ON fr.ticket_id = t.ticket_id
		WHERE ct.event_id = $1
		GROUP BY ct.category_ticket_id, ct.name, ct.price
		ORDER BY ct.category_ticket_id ASC
	`
	rows, err := r.db.QueryContext(ctx, ticketClassQuery, eventID)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn chi tiết loại vé: %w", err)
	}
	defer rows.Close()

	report.TicketClasses = make([]models.FinancialReportTicketClass, 0)
	for rows.Next() {
		var tc models.FinancialReportTicketClass
		if err := rows.Scan(
			&tc.CategoryTicketID,
			&tc.Name,
			&tc.Price,
			&tc.QuantitySold,
			&tc.GrossRevenue,
			&tc.CommissionFee,
			&tc.NetRevenue,
		); err == nil {
			report.TicketClasses = append(report.TicketClasses, tc)
		}
	}

	return &report, nil
}

// CreateOrganizerTopupOrder - Khởi tạo lệnh nạp tiền vào ví Organizer qua VietQR / SePay
func (r *TicketRepository) CreateOrganizerTopupOrder(ctx context.Context, userID int, amount float64) (*models.TopupWalletResponse, error) {
	if amount < 10000 {
		return nil, fmt.Errorf("số tiền nạp tối thiểu là 10.000 VND")
	}

	var billID int64
	insertBillQuery := `
		INSERT INTO bill (user_id, total_amount, currency, payment_method, payment_status, created_at)
		VALUES ($1, $2, 'VND', 'TOPUP', 'PENDING', NOW())
		RETURNING bill_id
	`
	err := r.db.QueryRowContext(ctx, insertBillQuery, userID, amount).Scan(&billID)
	if err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo hóa đơn nạp tiền: %w", err)
	}

	// Cú pháp chuyển khoản định dạng: TOPUP <bill_id>
	transferContent := fmt.Sprintf("TOPUP %d", billID)

	// 1. Thử tạo link thanh toán qua PayOS (Cổng mặc định)
	payosSvc := ticketutils.GetPayOSService()
	if payosSvc.IsConfigured() {
		frontendURL := strings.TrimRight(os.Getenv("FRONTEND_URL"), "/")
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}
		returnURL := fmt.Sprintf("%s/dashboard/organizer/wallet?status=topup_success&billId=%d", frontendURL, billID)
		cancelURL := fmt.Sprintf("%s/dashboard/organizer/wallet?status=topup_cancel&billId=%d", frontendURL, billID)

		payosResp, payosErr := payosSvc.CreatePaymentLink(ctx, billID, int(amount), transferContent, cancelURL, returnURL)
		if payosErr == nil && payosResp != nil {
			return &models.TopupWalletResponse{
				OrderID:         billID,
				Amount:          amount,
				Gateway:         "payos",
				CheckoutURL:     payosResp.CheckoutUrl,
				TransferContent: transferContent,
				BankCode:        payosResp.Bin,
				AccountNumber:   payosResp.AccountNumber,
				AccountName:     payosResp.AccountName,
				QRCodeURL:       payosResp.QrCode,
			}, nil
		}
	}

	// 2. Dự phòng qua VietQR / SePay (Cổng backup)
	bankCode := os.Getenv("VITE_BANK_NAME")
	if bankCode == "" {
		bankCode = "MB"
	}
	accountNumber := os.Getenv("VITE_BANK_ACC")
	if accountNumber == "" {
		accountNumber = "0333333333"
	}
	accountName := os.Getenv("VITE_BANK_ACCOUNT_NAME")
	if accountName == "" {
		accountName = "FPT EVENT MANAGEMENT"
	}

	qrURL := fmt.Sprintf(
		"https://img.vietqr.io/image/%s-%s-compact2.png?amount=%.0f&addInfo=%s&accountName=%s",
		bankCode,
		accountNumber,
		amount,
		url.QueryEscape(transferContent),
		url.QueryEscape(accountName),
	)

	return &models.TopupWalletResponse{
		OrderID:         billID,
		Amount:          amount,
		Gateway:         "sepay",
		TransferContent: transferContent,
		BankCode:        bankCode,
		AccountNumber:   accountNumber,
		AccountName:     accountName,
		QRCodeURL:       qrURL,
	}, nil
}

// AddOrganizerBankAccount - Thêm tài khoản ngân hàng thụ hưởng cho Organizer
func (r *TicketRepository) AddOrganizerBankAccount(ctx context.Context, userID int, req models.CreateBankAccountRequest) (*models.OrganizerBankAccount, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Nếu đánh dấu là mặc định, bỏ mặc định các tài khoản cũ
	if req.IsDefault {
		_, err = tx.ExecContext(ctx, "UPDATE organizer_bank_account SET is_default = FALSE WHERE user_id = $1", userID)
		if err != nil {
			return nil, fmt.Errorf("lỗi cập nhật tài khoản mặc định: %w", err)
		}
	}

	var account models.OrganizerBankAccount
	insertQuery := `
		INSERT INTO organizer_bank_account (user_id, bank_code, bank_name, account_number, account_holder_name, is_default, is_verified, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
		ON CONFLICT (user_id, bank_code, account_number) DO UPDATE
		SET bank_name = EXCLUDED.bank_name,
		    account_holder_name = EXCLUDED.account_holder_name,
		    is_default = EXCLUDED.is_default,
		    updated_at = NOW()
		RETURNING account_id, user_id, bank_code, bank_name, account_number, account_holder_name, is_verified, is_default, created_at
	`
	err = tx.QueryRowContext(ctx, insertQuery,
		userID,
		req.BankCode,
		req.BankName,
		req.AccountNumber,
		req.AccountHolderName,
		req.IsDefault,
	).Scan(
		&account.AccountID,
		&account.UserID,
		&account.BankCode,
		&account.BankName,
		&account.AccountNumber,
		&account.AccountHolderName,
		&account.IsVerified,
		&account.IsDefault,
		&account.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("lỗi lưu tài khoản ngân hàng: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	return &account, nil
}

// GetOrganizerBankAccounts - Lấy danh sách tài khoản ngân hàng của Organizer
func (r *TicketRepository) GetOrganizerBankAccounts(ctx context.Context, userID int) ([]models.OrganizerBankAccount, error) {
	query := `
		SELECT account_id, user_id, bank_code, bank_name, account_number, account_holder_name, is_verified, is_default, created_at
		FROM organizer_bank_account
		WHERE user_id = $1
		ORDER BY is_default DESC, created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn tài khoản ngân hàng: %w", err)
	}
	defer rows.Close()

	accounts := make([]models.OrganizerBankAccount, 0)
	for rows.Next() {
		var a models.OrganizerBankAccount
		if err := rows.Scan(
			&a.AccountID,
			&a.UserID,
			&a.BankCode,
			&a.BankName,
			&a.AccountNumber,
			&a.AccountHolderName,
			&a.IsVerified,
			&a.IsDefault,
			&a.CreatedAt,
		); err == nil {
			accounts = append(accounts, a)
		}
	}

	return accounts, nil
}

// RequestPayout - Tạo yêu cầu rút tiền từ số dư khả dụng (available_balance)
func (r *TicketRepository) RequestPayout(ctx context.Context, userID int, req models.CreatePayoutRequest) (*models.PayoutRequestItem, error) {
	if req.Amount < 50000 {
		return nil, fmt.Errorf("số tiền rút tối thiểu là 50.000 VND")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// 1. Kiểm tra tài khoản ngân hàng hợp lệ
	var bankAccount models.OrganizerBankAccount
	err = tx.QueryRowContext(ctx, `
		SELECT account_id, bank_code, bank_name, account_number, account_holder_name, is_verified
		FROM organizer_bank_account
		WHERE account_id = $1 AND user_id = $2
	`, req.BankAccountID, userID).Scan(
		&bankAccount.AccountID,
		&bankAccount.BankCode,
		&bankAccount.BankName,
		&bankAccount.AccountNumber,
		&bankAccount.AccountHolderName,
		&bankAccount.IsVerified,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("tài khoản ngân hàng không tồn tại hoặc không thuộc quyền sở hữu của bạn")
	} else if err != nil {
		return nil, fmt.Errorf("lỗi kiểm tra tài khoản ngân hàng: %w", err)
	}

	// 2. Khóa dòng ví và kiểm tra số dư khả dụng (available_balance = balance)
	var walletID int
	var currentBalance float64
	err = tx.QueryRowContext(ctx, `
		SELECT wallet_id, balance
		FROM wallet
		WHERE user_id = $1
		FOR UPDATE
	`, userID).Scan(&walletID, &currentBalance)
	if err != nil {
		return nil, fmt.Errorf("không tìm thấy ví người dùng: %w", err)
	}

	if currentBalance < req.Amount {
		return nil, fmt.Errorf("số dư khả dụng không đủ (Hiện có: %.0f VND, Yêu cầu: %.0f VND)", currentBalance, req.Amount)
	}

	// 3. Trừ số dư khả dụng
	balanceAfter := currentBalance - req.Amount
	_, err = tx.ExecContext(ctx, `
		UPDATE wallet
		SET balance = balance - $1, updated_at = NOW()
		WHERE wallet_id = $2
	`, req.Amount, walletID)
	if err != nil {
		return nil, fmt.Errorf("lỗi trừ số dư ví: %w", err)
	}

	// 4. Tạo bản ghi yêu cầu rút tiền (payout_request)
	var payoutID int
	var createdAt time.Time
	insertPayoutQuery := `
		INSERT INTO payout_request (user_id, bank_account_id, amount, status, note, created_at, updated_at)
		VALUES ($1, $2, $3, 'PENDING', $4, NOW(), NOW())
		RETURNING payout_id, created_at
	`
	err = tx.QueryRowContext(ctx, insertPayoutQuery, userID, req.BankAccountID, req.Amount, req.Note).Scan(&payoutID, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("lỗi tạo yêu cầu rút tiền: %w", err)
	}

	// 5. Ghi log sổ cái giao dịch ví (wallet_transaction)
	txLogQuery := `
		INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
		VALUES ($1, $2, 'WITHDRAWAL', $3, $4, $5, 'PAYOUT', $6, $7, NOW())
	`
	desc := fmt.Sprintf("Yêu cầu rút tiền về %s - %s", bankAccount.BankCode, bankAccount.AccountNumber)
	_, err = tx.ExecContext(ctx, txLogQuery, walletID, userID, req.Amount, currentBalance, balanceAfter, strconv.Itoa(payoutID), desc)
	if err != nil {
		return nil, fmt.Errorf("lỗi ghi log giao dịch ví: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	noteVal := req.Note
	return &models.PayoutRequestItem{
		PayoutID:          payoutID,
		UserID:            userID,
		BankAccountID:     bankAccount.AccountID,
		BankCode:          bankAccount.BankCode,
		BankName:          bankAccount.BankName,
		AccountNumber:     bankAccount.AccountNumber,
		AccountHolderName: bankAccount.AccountHolderName,
		Amount:            req.Amount,
		Status:            "PENDING",
		Note:              &noteVal,
		CreatedAt:         createdAt,
	}, nil
}

// GetPayoutRequests - Lấy danh sách yêu cầu rút tiền của Organizer
func (r *TicketRepository) GetPayoutRequests(ctx context.Context, userID int, page, limit int) ([]models.PayoutRequestItem, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var totalRecords int
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM payout_request WHERE user_id = $1", userID).Scan(&totalRecords)

	query := `
		SELECT pr.payout_id, pr.user_id, pr.bank_account_id,
		       ba.bank_code, ba.bank_name, ba.account_number, ba.account_holder_name,
		       pr.amount, pr.status, pr.note, pr.reject_reason, pr.processed_at, pr.created_at
		FROM payout_request pr
		JOIN organizer_bank_account ba ON ba.account_id = pr.bank_account_id
		WHERE pr.user_id = $1
		ORDER BY pr.created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("lỗi truy vấn yêu cầu rút tiền: %w", err)
	}
	defer rows.Close()

	items := make([]models.PayoutRequestItem, 0)
	for rows.Next() {
		var item models.PayoutRequestItem
		if err := rows.Scan(
			&item.PayoutID,
			&item.UserID,
			&item.BankAccountID,
			&item.BankCode,
			&item.BankName,
			&item.AccountNumber,
			&item.AccountHolderName,
			&item.Amount,
			&item.Status,
			&item.Note,
			&item.RejectReason,
			&item.ProcessedAt,
			&item.CreatedAt,
		); err == nil {
			items = append(items, item)
		}
	}

	return items, totalRecords, nil
}

// CalculateTicketCommission - Tính toán hoa hồng và doanh thu thuần cho 1 vé theo cơ chế lũy tiến
// On-Campus (SCHOOL): < 100 vé: 4.5% + 1.000đ; >= 100 vé: 3.5% + 1.000đ
// Off-Campus (FREE):   < 100 vé: 6.0% + 1.000đ; >= 100 vé: 5.0% + 1.000đ
func CalculateTicketCommission(ticketNumber int, price float64, orgType string) (feePercentage float64, fixedFee float64, commissionAmount float64, netAmount float64) {
	fixedFee = 1000.00
	if orgType == "SCHOOL" {
		if ticketNumber < 100 {
			feePercentage = 4.50
		} else {
			feePercentage = 3.50
		}
	} else {
		// Off-Campus / Independent
		if ticketNumber < 100 {
			feePercentage = 6.00
		} else {
			feePercentage = 5.00
		}
	}

	commissionAmount = math.Round(((price*feePercentage)/100.0 + fixedFee)*100) / 100
	netAmount = price - commissionAmount
	if netAmount < 0 {
		netAmount = 0
	}
	return
}

// ProcessPaidOrderCommissionTx - Xử lý tính hoa hồng, ghi biên lai tài chính và cộng vào pending_balance của Organizer trong transaction
func (r *TicketRepository) ProcessPaidOrderCommissionTx(
	ctx context.Context,
	tx *sql.Tx,
	billID int64,
	eventID int,
	ticketIDs []int,
	ticketPrices map[int]float64,
) error {
	log := logger.Default().WithContext(ctx)

	// 1. Lấy thông tin Organizer và OrgType của sự kiện
	var organizerID int
	var orgType string
	err := tx.QueryRowContext(ctx, "SELECT created_by, org_type FROM event WHERE event_id = $1", eventID).Scan(&organizerID, &orgType)
	if err != nil {
		log.Error("ProcessPaidOrderCommissionTx: Failed to query event", "event_id", eventID, "error", err)
		return fmt.Errorf("lỗi truy vấn sự kiện: %w", err)
	}

	// 2. Đếm số lượng vé đã xuất biên lai trước giao dịch này để phân tầng (Tier 1 vs Tier 2)
	var previouslySoldPaidCount int
	err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM financial_receipt WHERE event_id = $1", eventID).Scan(&previouslySoldPaidCount)
	if err != nil {
		previouslySoldPaidCount = 0
	}

	var totalNetAmount float64
	for i, tID := range ticketIDs {
		price := ticketPrices[tID]
		if price <= 0 {
			continue // Vé 0đ không sinh hoa hồng vé bán
		}

		currentTicketNumber := previouslySoldPaidCount + i
		feePercent, fixedFee, commission, net := CalculateTicketCommission(currentTicketNumber, price, orgType)
		totalNetAmount += net

		// Chèn bản ghi Financial Receipt bất biến
		insertReceiptQuery := `
			INSERT INTO financial_receipt (
				order_id, bill_id, ticket_id, event_id, organizer_id,
				gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VND', NOW())
		`
		_, err = tx.ExecContext(ctx, insertReceiptQuery,
			billID,
			billID,
			tID,
			eventID,
			organizerID,
			price,
			feePercent,
			fixedFee,
			commission,
			net,
		)
		if err != nil {
			log.Error("Failed to insert financial receipt", "ticket_id", tID, "error", err)
			return fmt.Errorf("lỗi lưu biên lai tài chính: %w", err)
		}
	}

	// 3. Nếu có doanh thu thuần, cộng vào pending_balance của Organizer và ghi sổ cái
	if totalNetAmount > 0 {
		var walletID int
		var currentPending float64
		var currentAvailable float64

		walletErr := tx.QueryRowContext(ctx, `
			SELECT wallet_id, balance, pending_balance
			FROM wallet
			WHERE user_id = $1
			FOR UPDATE
		`, organizerID).Scan(&walletID, &currentAvailable, &currentPending)

		if walletErr == sql.ErrNoRows {
			insertWalletQuery := `
				INSERT INTO wallet (user_id, balance, pending_balance, currency, status)
				VALUES ($1, 0.00, $2, 'VND', 'ACTIVE')
				RETURNING wallet_id, balance, pending_balance
			`
			err = tx.QueryRowContext(ctx, insertWalletQuery, organizerID, totalNetAmount).Scan(&walletID, &currentAvailable, &currentPending)
			if err != nil {
				return fmt.Errorf("lỗi khởi tạo ví organizer: %w", err)
			}
		} else if walletErr != nil {
			return fmt.Errorf("lỗi khóa ví organizer: %w", walletErr)
		} else {
			_, err = tx.ExecContext(ctx, `
				UPDATE wallet
				SET pending_balance = pending_balance + $1, updated_at = NOW()
				WHERE wallet_id = $2
			`, totalNetAmount, walletID)
			if err != nil {
				return fmt.Errorf("lỗi cập nhật pending_balance ví organizer: %w", err)
			}
		}

		// Ghi sổ cái ví (wallet_transaction)
		txLogQuery := `
			INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
			VALUES ($1, $2, 'TICKET_SALE', $3, $4, $5, 'BILL', $6, $7, NOW())
		`
		desc := fmt.Sprintf("Doanh thu bán vé (Tạm giữ) đơn #%d sự kiện #%d", billID, eventID)
		_, err = tx.ExecContext(ctx, txLogQuery,
			walletID,
			organizerID,
			totalNetAmount,
			currentPending,
			currentPending+totalNetAmount,
			strconv.FormatInt(billID, 10),
			desc,
		)
		if err != nil {
			log.Warn("Failed to log ticket sale to wallet transaction", "error", err)
		}
	}

	return nil
}

// ReleaseEventPendingPayout - Giải phóng toàn bộ pending_balance của sự kiện sang available_balance khi sự kiện FINISHED
func (r *TicketRepository) ReleaseEventPendingPayout(ctx context.Context, eventID int) error {
	log := logger.Default().WithContext(ctx)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Kiểm tra sự kiện
	var status string
	var isSettled bool
	var organizerID int
	var title string
	err = tx.QueryRowContext(ctx, `
		SELECT title, status, COALESCE(is_settled, FALSE), created_by
		FROM event
		WHERE event_id = $1
		FOR UPDATE
	`, eventID).Scan(&title, &status, &isSettled, &organizerID)
	if err != nil {
		return fmt.Errorf("không tìm thấy sự kiện #%d: %w", eventID, err)
	}

	if isSettled {
		log.Info("Event is already settled", "event_id", eventID)
		return nil // Idempotent
	}

	if status != "FINISHED" {
		return fmt.Errorf("sự kiện chưa hoàn thành (trạng thái hiện tại: %s). Chỉ quyết toán khi sự kiện đã FINISHED", status)
	}

	// 2. Tính tổng net_amount của sự kiện này từ financial_receipt
	var totalNet float64
	err = tx.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(net_amount), 0.00)
		FROM financial_receipt
		WHERE event_id = $1
	`, eventID).Scan(&totalNet)
	if err != nil {
		return fmt.Errorf("lỗi tính tổng doanh thu quyết toán: %w", err)
	}

	if totalNet > 0 {
		var walletID int
		var currentBalance float64
		var currentPending float64
		err = tx.QueryRowContext(ctx, `
			SELECT wallet_id, balance, pending_balance
			FROM wallet
			WHERE user_id = $1
			FOR UPDATE
		`, organizerID).Scan(&walletID, &currentBalance, &currentPending)
		if err != nil {
			return fmt.Errorf("lỗi truy vấn ví organizer: %w", err)
		}

		deductPending := totalNet
		if deductPending > currentPending {
			deductPending = currentPending
		}

		balanceAfter := currentBalance + totalNet

		_, err = tx.ExecContext(ctx, `
			UPDATE wallet
			SET balance = balance + $1,
			    pending_balance = GREATEST(0.00, pending_balance - $2),
			    updated_at = NOW()
			WHERE wallet_id = $3
		`, totalNet, deductPending, walletID)
		if err != nil {
			return fmt.Errorf("lỗi cập nhật số dư ví khi giải phóng quyết toán: %w", err)
		}

		// Ghi log sổ cái
		desc := fmt.Sprintf("Quyết toán doanh thu sự kiện kết thúc #%d: %s", eventID, title)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
			VALUES ($1, $2, 'EVENT_PAYOUT_RELEASE', $3, $4, $5, 'EVENT', $6, $7, NOW())
		`, walletID, organizerID, totalNet, currentBalance, balanceAfter, strconv.Itoa(eventID), desc)
		if err != nil {
			log.Warn("Failed to log EVENT_PAYOUT_RELEASE transaction", "error", err)
		}
	}

	// 3. Đánh dấu sự kiện đã quyết toán
	_, err = tx.ExecContext(ctx, `
		UPDATE event
		SET is_settled = TRUE, settled_at = NOW()
		WHERE event_id = $1
	`, eventID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật cờ quyết toán sự kiện: %w", err)
	}

	return tx.Commit()
}

// EnforceFreeEventQuotaTx - Kiểm tra hạn ngạch sự kiện miễn phí:
// <= 100 người: 0 VND
// > 100 người: On-Campus (SCHOOL) 250 VND, Off-Campus (FREE) 800 VND từ người thứ 101 trở đi
func (r *TicketRepository) EnforceFreeEventQuotaTx(ctx context.Context, tx *sql.Tx, eventID int, numTickets int) error {
	log := logger.Default().WithContext(ctx)

	// Đếm số lượng vé đã đăng ký thành công hoặc đang giữ chỗ của sự kiện
	var currentTicketsCount int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM ticket
		WHERE event_id = $1 AND status IN ('PENDING', 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
	`, eventID).Scan(&currentTicketsCount)
	if err != nil {
		return fmt.Errorf("lỗi kiểm tra số vé đã đăng ký: %w", err)
	}

	// Nếu đăng ký thêm vé mà chạm mốc > 100 vé
	if currentTicketsCount+numTickets > 100 {
		var organizerID int
		var orgType string
		var title string
		err = tx.QueryRowContext(ctx, "SELECT created_by, org_type, title FROM event WHERE event_id = $1", eventID).Scan(&organizerID, &orgType, &title)
		if err != nil {
			return fmt.Errorf("lỗi truy vấn thông tin sự kiện: %w", err)
		}

		// Tính số lượng vé vượt mốc 100
		overCount := numTickets
		if currentTicketsCount < 100 {
			overCount = (currentTicketsCount + numTickets) - 100
		}

		var feePerTicket float64
		if orgType == "SCHOOL" {
			feePerTicket = 250.00
		} else {
			feePerTicket = 800.00
		}

		totalFee := float64(overCount) * feePerTicket

		// Khóa ví Organizer để kiểm tra và trừ số dư khả dụng
		var walletID int
		var currentBalance float64
		err = tx.QueryRowContext(ctx, `
			SELECT wallet_id, balance
			FROM wallet
			WHERE user_id = $1
			FOR UPDATE
		`, organizerID).Scan(&walletID, &currentBalance)

		if err == sql.ErrNoRows || currentBalance < totalFee {
			log.Warn("Organizer wallet balance insufficient for free event quota",
				"organizer_id", organizerID,
				"current_balance", currentBalance,
				"required_fee", totalFee,
				"event_id", eventID,
			)
			return fmt.Errorf("[QUOTA_EXHAUSTED] Sự kiện đã đạt hạn ngạch 100 vé miễn phí và Ban tổ chức không đủ số dư để duy trì mở thêm đăng ký (Cần %.0f VND, hiện có %.0f VND). Vui lòng liên hệ Ban tổ chức!", totalFee, currentBalance)
		} else if err != nil {
			return fmt.Errorf("lỗi kiểm tra số dư ví ban tổ chức: %w", err)
		}

		balanceAfter := currentBalance - totalFee
		_, err = tx.ExecContext(ctx, `
			UPDATE wallet
			SET balance = balance - $1, updated_at = NOW()
			WHERE wallet_id = $2
		`, totalFee, walletID)
		if err != nil {
			return fmt.Errorf("lỗi khấu trừ phí hạn ngạch sự kiện miễn phí: %w", err)
		}

		// Ghi log sổ cái
		desc := fmt.Sprintf("Phí duy trì đăng ký vượt hạn ngạch 100 vé sự kiện #%d (%d vé x %.0f đ)", eventID, overCount, feePerTicket)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
			VALUES ($1, $2, 'USAGE_FEE', $3, $4, $5, 'FREE_EVENT_QUOTA', $6, $7, NOW())
		`, walletID, organizerID, totalFee, currentBalance, balanceAfter, strconv.Itoa(eventID), desc)
		if err != nil {
			log.Warn("Failed to log USAGE_FEE to wallet transaction", "error", err)
		}
	}

	return nil
}

// ProcessSePayTopup - Xử lý nạp tiền ví từ SePay webhook
func (r *TicketRepository) ProcessSePayTopup(ctx context.Context, gateway string, amount float64, orderID int64) (string, error) {
	log := logger.Default().WithContext(ctx)
	log.Info("ProcessSePayTopup: processing topup", "order_id", orderID, "amount", amount)

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var userID int
	var billAmount float64
	var paymentStatus string
	var paymentMethod sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT user_id, total_amount, payment_status, payment_method
		FROM Bill
		WHERE bill_id = $1
		FOR UPDATE
	`, orderID).Scan(&userID, &billAmount, &paymentStatus, &paymentMethod)

	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("không tìm thấy hóa đơn nạp tiền #%d", orderID)
		}
		return "", err
	}

	if paymentStatus == "PAID" {
		log.Info("Topup bill already processed", "order_id", orderID)
		return "already_processed", nil
	}

	if math.Abs(billAmount-amount) >= 1.0 {
		return "", fmt.Errorf("số tiền nạp không khớp: mong đợi %.2f, nhận được %.2f", billAmount, amount)
	}

	// 1. Cập nhật Bill thành PAID
	_, err = tx.ExecContext(ctx, "UPDATE Bill SET payment_status = 'PAID', paid_at = NOW() WHERE bill_id = $1", orderID)
	if err != nil {
		return "", fmt.Errorf("lỗi cập nhật trạng thái hóa đơn: %w", err)
	}

	// 2. Khóa hoặc tạo ví Organizer và cộng số dư khả dụng (balance)
	var walletID int
	var currentBalance float64
	err = tx.QueryRowContext(ctx, "SELECT wallet_id, balance FROM wallet WHERE user_id = $1 FOR UPDATE", userID).Scan(&walletID, &currentBalance)
	if err == sql.ErrNoRows {
		insertQuery := `
			INSERT INTO wallet (user_id, balance, pending_balance, currency, status)
			VALUES ($1, $2, 0.00, 'VND', 'ACTIVE')
			RETURNING wallet_id, balance
		`
		err = tx.QueryRowContext(ctx, insertQuery, userID, amount).Scan(&walletID, &currentBalance)
		if err != nil {
			return "", fmt.Errorf("lỗi khởi tạo ví khi nạp tiền: %w", err)
		}
		currentBalance = 0
	} else if err != nil {
		return "", fmt.Errorf("lỗi truy vấn ví khi nạp tiền: %w", err)
	} else {
		_, err = tx.ExecContext(ctx, "UPDATE wallet SET balance = balance + $1, updated_at = NOW() WHERE wallet_id = $2", amount, walletID)
		if err != nil {
			return "", fmt.Errorf("lỗi cộng tiền vào ví: %w", err)
		}
	}

	balanceAfter := currentBalance + amount

	// 3. Ghi log sổ cái wallet_transaction
	txLogQuery := `
		INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
		VALUES ($1, $2, 'TOPUP', $3, $4, $5, 'BILL', $6, $7, NOW())
	`
	desc := fmt.Sprintf("Nạp tiền vào ví qua cổng %s - Hóa đơn #%d", gateway, orderID)
	_, err = tx.ExecContext(ctx, txLogQuery, walletID, userID, amount, currentBalance, balanceAfter, strconv.FormatInt(orderID, 10), desc)
	if err != nil {
		return "", fmt.Errorf("lỗi ghi log giao dịch nạp tiền: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return "", err
	}

	log.Info("Successfully processed organizer wallet topup", "user_id", userID, "amount", amount, "bill_id", orderID)
	return "topup_success", nil
}

// ============================================================
// Admin Financial Center Repository Methods
// ============================================================

// GetAdminFinanceOverview - Lấy 4 chỉ số KPI tài chính toàn sàn
func (r *TicketRepository) GetAdminFinanceOverview(ctx context.Context) (*models.AdminFinanceOverviewResponse, error) {
	resp := &models.AdminFinanceOverviewResponse{}

	// 1. Tổng hoa hồng sàn
	_ = r.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(commission_amount), 0) FROM financial_receipt").Scan(&resp.TotalCommission)

	// 2. Tổng phí hạn ngạch thu từ các sự kiện Free vượt mức
	_ = r.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount), 0) FROM wallet_transaction WHERE type = 'USAGE_FEE'").Scan(&resp.TotalUsageFees)

	// 3. Tổng số dư tạm giữ (escrow locked) và số dư khả dụng toàn bộ ví
	_ = r.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(pending_balance), 0), COALESCE(SUM(balance), 0) FROM wallet WHERE status = 'ACTIVE'").Scan(
		&resp.TotalEscrowLocked,
		&resp.TotalWalletsBalance,
	)

	return resp, nil
}

// GetAdminPayouts - Lấy danh sách yêu cầu rút tiền phân trang cho Admin
func (r *TicketRepository) GetAdminPayouts(ctx context.Context, status string, page, limit int) (*models.AdminPayoutsResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var whereClauses []string
	var args []interface{}
	argIdx := 1

	if status != "" && status != "ALL" {
		whereClauses = append(whereClauses, fmt.Sprintf("pr.status = $%d", argIdx))
		args = append(args, strings.ToUpper(status))
		argIdx++
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM payout_request pr %s", whereSQL)
	var totalRecords int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords); err != nil {
		return nil, fmt.Errorf("lỗi đếm tổng số yêu cầu rút tiền: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT
			pr.payout_id, pr.user_id, COALESCE(u.full_name, u.email, 'Organizer'), COALESCE(u.email, ''),
			pr.bank_account_id, COALESCE(oba.bank_code, ''), COALESCE(oba.bank_name, ''),
			COALESCE(oba.account_number, ''), COALESCE(oba.account_holder_name, ''),
			pr.amount, pr.status, pr.note, pr.reject_reason,
			pr.processed_by, COALESCE(adm.full_name, adm.email, ''), pr.processed_at, pr.created_at
		FROM payout_request pr
		LEFT JOIN users u ON pr.user_id = u.user_id
		LEFT JOIN organizer_bank_account oba ON pr.bank_account_id = oba.account_id
		LEFT JOIN users adm ON pr.processed_by = adm.user_id
		%s
		ORDER BY pr.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn danh sách yêu cầu rút tiền: %w", err)
	}
	defer rows.Close()

	payouts := []models.AdminPayoutItem{}
	for rows.Next() {
		var item models.AdminPayoutItem
		var procName string
		err := rows.Scan(
			&item.PayoutID,
			&item.UserID,
			&item.OrganizerName,
			&item.OrganizerEmail,
			&item.BankAccountID,
			&item.BankCode,
			&item.BankName,
			&item.AccountNumber,
			&item.AccountHolderName,
			&item.Amount,
			&item.Status,
			&item.Note,
			&item.RejectReason,
			&item.ProcessedBy,
			&procName,
			&item.ProcessedAt,
			&item.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("lỗi scan dữ liệu yêu cầu rút tiền: %w", err)
		}
		if procName != "" {
			item.ProcessorName = &procName
		}
		payouts = append(payouts, item)
	}

	totalPages := int(math.Ceil(float64(totalRecords) / float64(limit)))
	if totalPages < 1 {
		totalPages = 1
	}

	return &models.AdminPayoutsResponse{
		Payouts:      payouts,
		TotalRecords: totalRecords,
		CurrentPage:  page,
		Limit:        limit,
		TotalPages:   totalPages,
	}, nil
}

// ProcessAdminPayout - Xử lý phê duyệt hoàn tất hoặc từ chối lệnh rút tiền
func (r *TicketRepository) ProcessAdminPayout(ctx context.Context, adminID int, payoutID int, req models.ProcessPayoutRequest) error {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return fmt.Errorf("lỗi khởi tạo transaction: %w", err)
	}
	defer tx.Rollback()

	var userID int
	var amount float64
	var currentStatus string
	query := `SELECT user_id, amount, status FROM payout_request WHERE payout_id = $1 FOR UPDATE`
	err = tx.QueryRowContext(ctx, query, payoutID).Scan(&userID, &amount, &currentStatus)
	if err == sql.ErrNoRows {
		return fmt.Errorf("không tìm thấy yêu cầu rút tiền #%d", payoutID)
	} else if err != nil {
		return fmt.Errorf("lỗi khóa bản ghi yêu cầu rút tiền: %w", err)
	}

	if currentStatus != "PENDING" && currentStatus != "PROCESSING" {
		return fmt.Errorf("lệnh rút tiền #%d đã được xử lý trước đó (trạng thái: %s)", payoutID, currentStatus)
	}

	action := strings.ToUpper(strings.TrimSpace(req.Action))

	if action == "APPROVE" || action == "COMPLETE" {
		noteUpdate := strings.TrimSpace(req.Note)
		if req.BankReferenceCode != "" {
			if noteUpdate != "" {
				noteUpdate += fmt.Sprintf(" | Mã GD Ngân hàng: %s", req.BankReferenceCode)
			} else {
				noteUpdate = fmt.Sprintf("Mã GD Ngân hàng: %s", req.BankReferenceCode)
			}
		}

		updateQuery := `
			UPDATE payout_request
			SET status = 'COMPLETED',
				processed_by = $1,
				processed_at = NOW(),
				note = CASE WHEN $2 != '' THEN $2 ELSE note END,
				updated_at = NOW()
			WHERE payout_id = $3
		`
		_, err = tx.ExecContext(ctx, updateQuery, adminID, noteUpdate, payoutID)
		if err != nil {
			return fmt.Errorf("lỗi cập nhật trạng thái COMPLETED cho lệnh rút tiền: %w", err)
		}
	} else if action == "REJECT" {
		reason := strings.TrimSpace(req.RejectReason)
		if reason == "" {
			reason = "Bị từ chối bởi Quản trị viên"
		}

		updateQuery := `
			UPDATE payout_request
			SET status = 'REJECTED',
				processed_by = $1,
				processed_at = NOW(),
				reject_reason = $2,
				updated_at = NOW()
			WHERE payout_id = $3
		`
		_, err = tx.ExecContext(ctx, updateQuery, adminID, reason, payoutID)
		if err != nil {
			return fmt.Errorf("lỗi cập nhật trạng thái REJECTED cho lệnh rút tiền: %w", err)
		}

		// Hoàn trả lại số tiền vào available_balance của Organizer
		var walletID int
		var currentBalance float64
		err = tx.QueryRowContext(ctx, "SELECT wallet_id, balance FROM wallet WHERE user_id = $1 FOR UPDATE", userID).Scan(&walletID, &currentBalance)
		if err != nil {
			return fmt.Errorf("lỗi khóa ví organizer khi hoàn tiền: %w", err)
		}

		balanceAfter := currentBalance + amount
		_, err = tx.ExecContext(ctx, "UPDATE wallet SET balance = balance + $1, updated_at = NOW() WHERE wallet_id = $2", amount, walletID)
		if err != nil {
			return fmt.Errorf("lỗi cộng hoàn tiền vào ví organizer: %w", err)
		}

		// Ghi log sổ cái hoàn trả tiền
		txLogQuery := `
			INSERT INTO wallet_transaction (wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at)
			VALUES ($1, $2, 'CREDIT', $3, $4, $5, 'PAYOUT', $6, $7, NOW())
		`
		txDesc := fmt.Sprintf("Hoàn tiền lệnh rút tiền #%d bị từ chối: %s", payoutID, reason)
		_, err = tx.ExecContext(ctx, txLogQuery, walletID, userID, amount, currentBalance, balanceAfter, strconv.Itoa(payoutID), txDesc)
		if err != nil {
			return fmt.Errorf("lỗi ghi log giao dịch hoàn tiền rút: %w", err)
		}
	} else {
		return fmt.Errorf("hành động không hợp lệ: %s (chỉ chấp nhận APPROVE, COMPLETE, REJECT)", req.Action)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("lỗi commit transaction: %w", err)
	}

	return nil
}

// GetAdminFinancialReceipts - Lấy danh sách biên lai tài chính phân trang
func (r *TicketRepository) GetAdminFinancialReceipts(ctx context.Context, page, limit int, search string) (*models.AdminReceiptsResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var whereClauses []string
	var args []interface{}
	argIdx := 1

	if search != "" {
		s := "%" + strings.ToLower(search) + "%"
		whereClauses = append(whereClauses, fmt.Sprintf("(LOWER(e.title) LIKE $%d OR LOWER(u.full_name) LIKE $%d OR CAST(fr.order_id AS TEXT) LIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, s)
		argIdx++
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM financial_receipt fr
		LEFT JOIN event e ON fr.event_id = e.event_id
		LEFT JOIN users u ON fr.organizer_id = u.user_id
		%s
	`, whereSQL)

	var totalRecords int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords); err != nil {
		return nil, fmt.Errorf("lỗi đếm tổng biên lai: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT
			fr.receipt_id, fr.order_id, fr.bill_id, fr.ticket_id,
			fr.event_id, COALESCE(e.title, 'Sự kiện #' || fr.event_id),
			fr.organizer_id, COALESCE(u.full_name, u.email, 'Organizer #' || fr.organizer_id),
			fr.gross_amount, fr.system_fee_percentage, fr.fixed_fee,
			fr.commission_amount, fr.net_amount, fr.currency, fr.created_at
		FROM financial_receipt fr
		LEFT JOIN event e ON fr.event_id = e.event_id
		LEFT JOIN users u ON fr.organizer_id = u.user_id
		%s
		ORDER BY fr.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn biên lai tài chính: %w", err)
	}
	defer rows.Close()

	receipts := []models.AdminReceiptItem{}
	for rows.Next() {
		var item models.AdminReceiptItem
		err := rows.Scan(
			&item.ReceiptID,
			&item.OrderID,
			&item.BillID,
			&item.TicketID,
			&item.EventID,
			&item.EventTitle,
			&item.OrganizerID,
			&item.OrganizerName,
			&item.GrossAmount,
			&item.SystemFeePercentage,
			&item.FixedFee,
			&item.CommissionAmount,
			&item.NetAmount,
			&item.Currency,
			&item.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("lỗi scan biên lai tài chính: %w", err)
		}
		receipts = append(receipts, item)
	}

	totalPages := int(math.Ceil(float64(totalRecords) / float64(limit)))
	if totalPages < 1 {
		totalPages = 1
	}

	return &models.AdminReceiptsResponse{
		Receipts:     receipts,
		TotalRecords: totalRecords,
		CurrentPage:  page,
		Limit:        limit,
		TotalPages:   totalPages,
	}, nil
}

// ExportAdminFinancialReceiptsCSV - Xuất dữ liệu biên lai tài chính sang CSV (UTF-8 BOM cho Excel)
func (r *TicketRepository) ExportAdminFinancialReceiptsCSV(ctx context.Context) ([]byte, error) {
	query := `
		SELECT
			fr.receipt_id, fr.order_id, COALESCE(fr.bill_id, 0), COALESCE(fr.ticket_id, 0),
			fr.event_id, COALESCE(e.title, ''),
			fr.organizer_id, COALESCE(u.full_name, u.email, ''),
			fr.gross_amount, fr.system_fee_percentage, fr.fixed_fee,
			fr.commission_amount, fr.net_amount, fr.currency, fr.created_at
		FROM financial_receipt fr
		LEFT JOIN event e ON fr.event_id = e.event_id
		LEFT JOIN users u ON fr.organizer_id = u.user_id
		ORDER BY fr.created_at DESC
		LIMIT 5000
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn xuất CSV: %w", err)
	}
	defer rows.Close()

	var buf bytes.Buffer
	// UTF-8 BOM
	buf.WriteString("\xef\xbb\xbf")

	writer := csv.NewWriter(&buf)

	// CSV Header
	headers := []string{
		"Mã Biên Lai",
		"Mã Đơn Hàng",
		"Mã Hóa Đơn",
		"Mã Vé",
		"Mã Sự Kiện",
		"Tên Sự Kiện",
		"Mã BTC",
		"Tên Ban Tổ Chức",
		"Số Tiền Gốc (VND)",
		"% Phí Sàn",
		"Phí Cố Định (VND)",
		"Doanh Thu Sàn Thu (VND)",
		"Doanh Thu Về Ví BTC (VND)",
		"Loại Tiền",
		"Thời Gian Tạo",
	}
	if err := writer.Write(headers); err != nil {
		return nil, err
	}

	for rows.Next() {
		var receiptID int
		var orderID int64
		var billID, ticketID, eventID, orgID int
		var eventTitle, orgName, currency string
		var gross, feePct, fixedFee, commission, net float64
		var createdAt time.Time

		err := rows.Scan(
			&receiptID, &orderID, &billID, &ticketID,
			&eventID, &eventTitle,
			&orgID, &orgName,
			&gross, &feePct, &fixedFee,
			&commission, &net, &currency, &createdAt,
		)
		if err != nil {
			return nil, err
		}

		record := []string{
			strconv.Itoa(receiptID),
			strconv.FormatInt(orderID, 10),
			strconv.Itoa(billID),
			strconv.Itoa(ticketID),
			strconv.Itoa(eventID),
			eventTitle,
			strconv.Itoa(orgID),
			orgName,
			fmt.Sprintf("%.0f", gross),
			fmt.Sprintf("%.2f%%", feePct),
			fmt.Sprintf("%.0f", fixedFee),
			fmt.Sprintf("%.0f", commission),
			fmt.Sprintf("%.0f", net),
			currency,
			createdAt.Format("2006-01-02 15:04:05"),
		}
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

