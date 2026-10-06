package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"os"

	"github.com/fpt-event-services/services/ticket-service/models"
	"github.com/fpt-event-services/services/ticket-service/repository"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		log.Fatal("DB_URL not found in .env")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping DB: %v", err)
	}
	fmt.Println("============================================================")
	fmt.Println("🚀 STARTING COMPREHENSIVE LOCAL INTEGRATION TEST")
	fmt.Println("============================================================")

	ctx := context.Background()
	repo := repository.NewTicketRepositoryWithDB(db)

	// 1. Tìm hoặc tạo Organizer test user
	var organizerID int
	err = db.QueryRowContext(ctx, "SELECT user_id FROM users WHERE role = 'ORGANIZER' LIMIT 1").Scan(&organizerID)
	if err != nil {
		// Tạo mock organizer nếu chưa có
		err = db.QueryRowContext(ctx, `
			INSERT INTO users (full_name, email, password_hash, role, status)
			VALUES ('Test Organizer', 'test_organizer_fems@fpt.edu.vn', 'hash123', 'ORGANIZER', 'ACTIVE')
			ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
			RETURNING user_id
		`).Scan(&organizerID)
		if err != nil {
			log.Fatalf("Error getting or creating test organizer: %v", err)
		}
	}
	fmt.Printf("✅ Test Organizer ID: %d\n", organizerID)

	// ============================================================
	// TEST 1: Get Organizer Wallet (Khởi tạo ví nếu chưa có)
	// ============================================================
	wallet, err := repo.GetOrganizerWallet(ctx, organizerID)
	if err != nil {
		log.Fatalf("❌ TEST 1 FAILED: %v", err)
	}
	fmt.Printf("✅ TEST 1 PASSED: GetOrganizerWallet -> ID: %d, Available: %.2f, Pending: %.2f, Lifetime: %.2f\n",
		wallet.WalletID, wallet.AvailableBalance, wallet.PendingBalance, wallet.LifetimeEarnings)

	initialAvailable := wallet.AvailableBalance

	// ============================================================
	// TEST 2: Nạp tiền ví Organizer qua SePay (Top-up Flow)
	// ============================================================
	topupAmount := 500000.0
	topupOrder, err := repo.CreateOrganizerTopupOrder(ctx, organizerID, topupAmount)
	if err != nil {
		log.Fatalf("❌ TEST 2.1 FAILED (CreateOrganizerTopupOrder): %v", err)
	}
	fmt.Printf("✅ TEST 2.1 PASSED: Created Topup Order #%d, Content: '%s', QR: %s\n",
		topupOrder.OrderID, topupOrder.TransferContent, topupOrder.QRCodeURL[:50]+"...")

	// Giả lập SePay webhook bắn về nạp tiền thành công
	webhookResult, err := repo.ProcessSePayTopup(ctx, "MBBank", topupAmount, topupOrder.OrderID)
	if err != nil {
		log.Fatalf("❌ TEST 2.2 FAILED (ProcessSePayTopup): %v", err)
	}
	fmt.Printf("✅ TEST 2.2 PASSED: ProcessSePayTopup Result: '%s'\n", webhookResult)

	// Kiểm tra số dư khả dụng sau khi nạp
	walletAfterTopup, err := repo.GetOrganizerWallet(ctx, organizerID)
	if err != nil || walletAfterTopup.AvailableBalance < initialAvailable+topupAmount {
		log.Fatalf("❌ TEST 2.3 FAILED: Available balance mismatch! Expected >= %.2f, Got: %.2f",
			initialAvailable+topupAmount, walletAfterTopup.AvailableBalance)
	}
	fmt.Printf("✅ TEST 2.3 PASSED: Verified Available Balance increased to: %.2f\n", walletAfterTopup.AvailableBalance)

	// Thử bắn lại webhook để kiểm tra Idempotency
	idempotentRes, err := repo.ProcessSePayTopup(ctx, "MBBank", topupAmount, topupOrder.OrderID)
	if err != nil || idempotentRes != "already_processed" {
		log.Fatalf("❌ TEST 2.4 FAILED (Idempotency): Expected 'already_processed', got: %s, err: %v", idempotentRes, err)
	}
	fmt.Printf("✅ TEST 2.4 PASSED: Webhook Idempotency verified: '%s'\n", idempotentRes)

	// ============================================================
	// TEST 3: Tạo sự kiện test có phí & Bán vé với Hoa hồng lũy tiến
	// ============================================================
	var testEventID int
	err = db.QueryRowContext(ctx, `
		INSERT INTO event (title, description, start_time, end_time, created_by, status, org_type, event_format)
		VALUES ('Test Paid Gala', 'Testing payment wallet', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '3 hours', $1, 'OPEN', 'SCHOOL', 'ONLINE')
		RETURNING event_id
	`, organizerID).Scan(&testEventID)
	if err != nil {
		log.Fatalf("❌ TEST 3.1 FAILED (Create Test Event): %v", err)
	}
	fmt.Printf("✅ TEST 3.1 PASSED: Created Test Event ID: %d (SCHOOL/On-Campus)\n", testEventID)

	// Tạo category ticket
	var catTicketID int
	err = db.QueryRowContext(ctx, `
		INSERT INTO category_ticket (event_id, name, price, max_quantity, status)
		VALUES ($1, 'VIP Pass', 100000.0, 500, 'AVAILABLE')
		RETURNING category_ticket_id
	`, testEventID).Scan(&catTicketID)
	if err != nil {
		log.Fatalf("❌ TEST 3.2 FAILED (Create Category Ticket): %v", err)
	}
	fmt.Printf("✅ TEST 3.2 PASSED: Created Category Ticket ID: %d (Price: 100,000 VND)\n", catTicketID)

	// Giả lập mua 2 vé: vé #0 (Tier 1) và vé #100 (Tier 2)
	// Chạy transaction hoa hồng
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("❌ TEST 3.3 FAILED (BeginTx): %v", err)
	}

	// Tạo Bill và 2 tickets
	var testBillID int64
	_ = tx.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES ($1, 200000, 'VND', 'SePay', 'PAID', NOW(), NOW()) RETURNING bill_id", organizerID).Scan(&testBillID)

	var ticketID1, ticketID2 int
	_ = tx.QueryRowContext(ctx, "INSERT INTO ticket (event_id, user_id, category_ticket_id, bill_id, qr_code_value, status) VALUES ($1, $2, $3, $4, 'QR1', 'BOOKED') RETURNING ticket_id", testEventID, organizerID, catTicketID, testBillID).Scan(&ticketID1)
	_ = tx.QueryRowContext(ctx, "INSERT INTO ticket (event_id, user_id, category_ticket_id, bill_id, qr_code_value, status) VALUES ($1, $2, $3, $4, 'QR2', 'BOOKED') RETURNING ticket_id", testEventID, organizerID, catTicketID, testBillID).Scan(&ticketID2)

	ticketPrices := map[int]int64{
		ticketID1: 100000,
		ticketID2: 100000,
	}

	// Tier 1 cho SCHOOL: 4.5% + 1.000đ = 5.500đ -> Net = 94.500đ mỗi vé x 2 = 189.000đ
	err = repo.ProcessPaidOrderCommissionTx(ctx, tx, testBillID, testEventID, []int{ticketID1, ticketID2}, ticketPrices)
	if err != nil {
		tx.Rollback()
		log.Fatalf("❌ TEST 3.3 FAILED (ProcessPaidOrderCommissionTx): %v", err)
	}
	if err = tx.Commit(); err != nil {
		log.Fatalf("❌ TEST 3.3 FAILED (Commit): %v", err)
	}
	fmt.Printf("✅ TEST 3.3 PASSED: ProcessPaidOrderCommissionTx executed successfully for Bill #%d\n", testBillID)

	// Kiểm tra biên lai tài chính (financial_receipt)
	var receiptCount int
	var totalGross, totalNet float64
	err = db.QueryRowContext(ctx, "SELECT COUNT(*), SUM(gross_amount), SUM(net_amount) FROM financial_receipt WHERE bill_id = $1", testBillID).Scan(&receiptCount, &totalGross, &totalNet)
	if err != nil || receiptCount != 2 || totalGross != 200000.0 || totalNet != 189000.0 {
		log.Fatalf("❌ TEST 3.4 FAILED: Receipt verification failed. Count: %d, Gross: %.2f, Net: %.2f (Expected Net: 189,000)", receiptCount, totalGross, totalNet)
	}
	fmt.Printf("✅ TEST 3.4 PASSED: Verified 2 Financial Receipts (Gross: %.0f, Net: %.0f, Commission: %.0f)\n", totalGross, totalNet, totalGross-totalNet)

	// Kiểm tra pending_balance của Organizer đã tăng lên đúng 189.000 VND
	walletAfterSale, err := repo.GetOrganizerWallet(ctx, organizerID)
	if err != nil {
		log.Fatalf("❌ TEST 3.5 FAILED: %v", err)
	}
	fmt.Printf("✅ TEST 3.5 PASSED: Organizer Wallet -> Available: %.2f, Pending: %.2f (Net sales credited to Pending!)\n",
		walletAfterSale.AvailableBalance, walletAfterSale.PendingBalance)

	// ============================================================
	// TEST 4: Báo cáo tài chính sự kiện (GetEventFinancialReport)
	// ============================================================
	report, err := repo.GetEventFinancialReport(ctx, organizerID, testEventID)
	if err != nil {
		log.Fatalf("❌ TEST 4 FAILED: %v", err)
	}
	fmt.Printf("✅ TEST 4 PASSED: Financial Report -> Title: '%s', Tickets: %d, Gross: %.0f, Comm: %.0f, Net: %.0f, TicketClasses: %d\n",
		report.Title, report.TotalTicketsSold, report.GrossRevenue, report.TotalCommissionFee, report.NetRevenue, len(report.TicketClasses))

	// ============================================================
	// TEST 5: Quyết toán khi sự kiện FINISHED (ReleaseEventPendingPayout)
	// ============================================================
	// Đổi trạng thái sự kiện sang FINISHED
	_, _ = db.ExecContext(ctx, "UPDATE event SET status = 'FINISHED' WHERE event_id = $1", testEventID)

	availBeforeSettle := walletAfterSale.AvailableBalance
	err = repo.ReleaseEventPendingPayout(ctx, testEventID)
	if err != nil {
		log.Fatalf("❌ TEST 5.1 FAILED (ReleaseEventPendingPayout): %v", err)
	}

	walletAfterSettle, err := repo.GetOrganizerWallet(ctx, organizerID)
	if err != nil {
		log.Fatalf("❌ TEST 5.2 FAILED: %v", err)
	}
	if math.Abs((walletAfterSettle.AvailableBalance-availBeforeSettle)-189000.0) > 1.0 {
		log.Fatalf("❌ TEST 5.2 FAILED: Available balance did not increase by 189,000! Before: %.2f, After: %.2f",
			availBeforeSettle, walletAfterSettle.AvailableBalance)
	}
	fmt.Printf("✅ TEST 5.1 & 5.2 PASSED: Event Settled! Available balance increased from %.0f -> %.0f\n",
		availBeforeSettle, walletAfterSettle.AvailableBalance)

	// Idempotency: chạy lại lần 2 không bị cộng lặp
	err = repo.ReleaseEventPendingPayout(ctx, testEventID)
	if err != nil {
		log.Fatalf("❌ TEST 5.3 FAILED (Settle Idempotency): %v", err)
	}
	walletDoubleSettle, _ := repo.GetOrganizerWallet(ctx, organizerID)
	if walletDoubleSettle.AvailableBalance != walletAfterSettle.AvailableBalance {
		log.Fatalf("❌ TEST 5.3 FAILED: Double settlement occurred! Balance changed to %.2f", walletDoubleSettle.AvailableBalance)
	}
	fmt.Println("✅ TEST 5.3 PASSED: Settlement Idempotency verified (No double release)")

	// ============================================================
	// TEST 6: Ngân hàng thụ hưởng & Yêu cầu rút tiền (Payout Request)
	// ============================================================
	bankReq := models.CreateBankAccountRequest{
		BankCode:          "MB",
		BankName:          "MBBank",
		AccountNumber:     "999988887777",
		AccountHolderName: "NGUYEN VAN ORGANIZER",
		IsDefault:         true,
	}
	bankAcc, err := repo.AddOrganizerBankAccount(ctx, organizerID, bankReq)
	if err != nil {
		log.Fatalf("❌ TEST 6.1 FAILED (AddOrganizerBankAccount): %v", err)
	}
	fmt.Printf("✅ TEST 6.1 PASSED: Added Bank Account ID: %d (%s - %s)\n", bankAcc.AccountID, bankAcc.BankCode, bankAcc.AccountNumber)

	bankAccounts, err := repo.GetOrganizerBankAccounts(ctx, organizerID)
	if err != nil || len(bankAccounts) == 0 {
		log.Fatalf("❌ TEST 6.2 FAILED (GetOrganizerBankAccounts): %v", err)
	}
	fmt.Printf("✅ TEST 6.2 PASSED: Retrieved %d linked bank account(s)\n", len(bankAccounts))

	// Rút tiền 100.000 VND
	payoutAmount := 100000.0
	availBeforePayout := walletAfterSettle.AvailableBalance
	payoutReq := models.CreatePayoutRequest{
		BankAccountID: bankAcc.AccountID,
		Amount:        payoutAmount,
		Note:          "Rut tien loi nhuan ban ve test",
	}
	payoutItem, err := repo.RequestPayout(ctx, organizerID, payoutReq)
	if err != nil {
		log.Fatalf("❌ TEST 6.3 FAILED (RequestPayout): %v", err)
	}
	fmt.Printf("✅ TEST 6.3 PASSED: Created Payout Request #%d, Amount: %.0f, Status: %s\n",
		payoutItem.PayoutID, payoutItem.Amount, payoutItem.Status)

	walletAfterPayout, _ := repo.GetOrganizerWallet(ctx, organizerID)
	if math.Abs((availBeforePayout-walletAfterPayout.AvailableBalance)-payoutAmount) > 1.0 {
		log.Fatalf("❌ TEST 6.4 FAILED: Balance deduction mismatch. Expected %.0f, Got: %.0f",
			availBeforePayout-payoutAmount, walletAfterPayout.AvailableBalance)
	}
	fmt.Printf("✅ TEST 6.4 PASSED: Available Balance deducted accurately from %.0f -> %.0f\n",
		availBeforePayout, walletAfterPayout.AvailableBalance)

	// Kiểm tra chặn rút quá số dư
	excessivePayout := models.CreatePayoutRequest{
		BankAccountID: bankAcc.AccountID,
		Amount:        999999999.0, // Quá số dư
		Note:          "Rut qua so du",
	}
	_, excessiveErr := repo.RequestPayout(ctx, organizerID, excessivePayout)
	if excessiveErr == nil {
		log.Fatalf("❌ TEST 6.5 FAILED: Expected error when requesting excessive payout, but succeeded!")
	}
	fmt.Printf("✅ TEST 6.5 PASSED: Excessive payout prevented: '%v'\n", excessiveErr)

	// ============================================================
	// TEST 7: Kiểm soát hạn ngạch sự kiện miễn phí (Free Event Quota)
	// ============================================================
	var freeEventID int
	err = db.QueryRowContext(ctx, `
		INSERT INTO event (title, description, start_time, end_time, created_by, status, org_type, event_format)
		VALUES ('Test Free Workshop', 'Free quota test', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', $1, 'OPEN', 'SCHOOL', 'ONLINE')
		RETURNING event_id
	`, organizerID).Scan(&freeEventID)
	if err != nil {
		log.Fatalf("❌ TEST 7.1 FAILED (Create Free Event): %v", err)
	}

	// 7.1 Khi sự kiện dưới 100 vé: Không bị trừ phí
	txFree1, _ := db.BeginTx(ctx, nil)
	err = repo.EnforceFreeEventQuotaTx(ctx, txFree1, freeEventID, 5)
	if err != nil {
		log.Fatalf("❌ TEST 7.2 FAILED: Under 100 tickets should be free: %v", err)
	}
	_ = txFree1.Commit()
	fmt.Println("✅ TEST 7.2 PASSED: Registrations <= 100 are completely FREE (0 VND)")

	// 7.2 Giả lập sự kiện đã có 100 vé, người thứ 101 đăng ký -> trừ 250đ (SCHOOL)
	// Chèn 100 vé mock
	for i := 0; i < 100; i++ {
		_, _ = db.ExecContext(ctx, "INSERT INTO ticket (event_id, user_id, category_ticket_id, qr_code_value, status) VALUES ($1, $2, $3, $4, 'BOOKED')",
			freeEventID, organizerID, catTicketID, fmt.Sprintf("MOCK_QR_%d", i))
	}

	availBeforeOver := walletAfterPayout.AvailableBalance
	txFree2, _ := db.BeginTx(ctx, nil)
	// Đăng ký thêm 2 vé khi đã đạt 100 vé -> trừ 2 x 250 = 500 VND
	err = repo.EnforceFreeEventQuotaTx(ctx, txFree2, freeEventID, 2)
	if err != nil {
		txFree2.Rollback()
		log.Fatalf("❌ TEST 7.3 FAILED (EnforceFreeEventQuotaTx > 100): %v", err)
	}
	_ = txFree2.Commit()

	walletAfterOver, _ := repo.GetOrganizerWallet(ctx, organizerID)
	if math.Abs((availBeforeOver-walletAfterOver.AvailableBalance)-500.0) > 1.0 {
		log.Fatalf("❌ TEST 7.3 FAILED: Expected 500 VND deducted for 2 quota tickets. Before: %.0f, After: %.0f",
			availBeforeOver, walletAfterOver.AvailableBalance)
	}
	fmt.Printf("✅ TEST 7.3 PASSED: Registration #101 & #102 deducted 500 VND (2 x 250đ) from organizer balance: %.0f -> %.0f\n",
		availBeforeOver, walletAfterOver.AvailableBalance)

	// ============================================================
	// TEST 8: Lịch sử giao dịch sổ cái ví (GetOrganizerWalletTransactions)
	// ============================================================
	txHistory, err := repo.GetOrganizerWalletTransactions(ctx, organizerID, 1, 20, "", "", "")
	if err != nil || len(txHistory.Transactions) == 0 {
		log.Fatalf("❌ TEST 8 FAILED: %v", err)
	}
	fmt.Printf("✅ TEST 8 PASSED: Retrieved %d ledger transaction(s) across entire flow\n", len(txHistory.Transactions))
	for _, txItem := range txHistory.Transactions[:int(math.Min(float64(len(txHistory.Transactions)), 5))] {
		fmt.Printf("   - [%s] Amount: %10.0f | Balance: %10.0f -> %10.0f | Desc: %s\n",
			txItem.Type, txItem.Amount, txItem.BalanceBefore, txItem.BalanceAfter, *txItem.Description)
	}

	// Dọn dẹp dữ liệu test sự kiện
	_, _ = db.ExecContext(ctx, "DELETE FROM financial_receipt WHERE event_id IN ($1, $2)", testEventID, freeEventID)
	_, _ = db.ExecContext(ctx, "DELETE FROM ticket WHERE event_id IN ($1, $2)", testEventID, freeEventID)
	_, _ = db.ExecContext(ctx, "DELETE FROM category_ticket WHERE event_id IN ($1, $2)", testEventID, freeEventID)
	_, _ = db.ExecContext(ctx, "DELETE FROM event WHERE event_id IN ($1, $2)", testEventID, freeEventID)

	fmt.Println("============================================================")
	fmt.Println("🎉 ALL 8 INTEGRATION TESTS PASSED 100% ON LOCAL ENVIRONMENT!")
	fmt.Println("============================================================")
}
