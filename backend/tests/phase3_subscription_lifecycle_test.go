package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	ticketRepo "github.com/fpt-event-services/services/ticket-service/repository"
	ticketScheduler "github.com/fpt-event-services/services/ticket-service/scheduler"
	_ "github.com/lib/pq"
)

func TestPhase3_SubscriptionLifecycle_RealDockerDB(t *testing.T) {
	connStr := "postgres://postgres:postgres@localhost:5432/fpt_event_test?sslmode=disable"

	// SAFETY GUARD: Tuyệt đối từ chối chạy nếu host/DB không phải container test local
	if !strings.Contains(connStr, "localhost") && !strings.Contains(connStr, "127.0.0.1") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên host không phải localhost! ConnStr: %s", connStr)
	}
	if !strings.Contains(connStr, "fpt_event_test") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên DB không chứa 'fpt_event_test'! ConnStr: %s", connStr)
	}
	t.Log("🛡️ SAFETY GUARD PASSED: Đang kết nối tới container test an toàn (localhost:5432 / fpt_event_test).")

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Fatalf("Không thể mở kết nối tới Docker Postgres: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	tRepo := ticketRepo.NewTicketRepositoryWithDB(db)
	sched := ticketScheduler.NewSubscriptionExpiryScheduler(db, 60)

	// 1. Chạy migration thật từ file (03 -> 04a)
	candidates := []string{
		filepath.Join("..", "..", "Database", "migrations"),
		filepath.Join("..", "Database", "migrations"),
		filepath.Join("Database", "migrations"),
	}
	var migDir string
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "04a_subscription_and_dynamic_fees.sql")); err == nil {
			migDir = c
			break
		}
	}
	if migDir == "" {
		t.Fatalf("Không tìm thấy thư mục Database/migrations từ các đường dẫn tương đối!")
	}

	m03Path := filepath.Join(migDir, "03_add_school_organizer_enum.sql")
	if m03SQL, err := os.ReadFile(m03Path); err == nil {
		_, _ = db.ExecContext(ctx, string(m03SQL))
	}
	m04aPath := filepath.Join(migDir, "04a_subscription_and_dynamic_fees.sql")
	m04aSQL, err := os.ReadFile(m04aPath)
	if err != nil {
		t.Fatalf("Không đọc được file migration 04a: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(m04aSQL)); err != nil {
		t.Fatalf("Lỗi chạy migration 04a: %v", err)
	}

	// Clean up and prepare test users (User IDs: 701..720)
	cleanupSQL := `
		DELETE FROM subscription_payment_log WHERE user_id BETWEEN 700 AND 720;
		DELETE FROM user_subscription WHERE user_id BETWEEN 700 AND 720;
		DELETE FROM organizer_fee_override WHERE organizer_id BETWEEN 700 AND 720;
		DELETE FROM wallet_transaction WHERE user_id BETWEEN 700 AND 720;
		DELETE FROM wallet WHERE user_id BETWEEN 700 AND 720;
		DELETE FROM users WHERE user_id BETWEEN 700 AND 720;

		INSERT INTO users (user_id, full_name, email, password_hash, role, status) VALUES
		(701, 'User Sub Insufficient', 'sub.insufficient@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(702, 'User Sub Idempotent', 'sub.idempotent@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(703, 'User Sub Extend', 'sub.extend@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(704, 'User Sub Upgrade', 'sub.upgrade@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(705, 'User Sub Downgrade', 'sub.downgrade@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(706, 'User Sub AutoRenew Success', 'sub.renew.ok@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(707, 'User Sub AutoRenew Fail', 'sub.renew.fail@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(708, 'User Sub Disabled Tier', 'sub.disabled@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(709, 'User Sub Concurrency Buy', 'sub.conc.buy@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(710, 'User Sub AutoRenew Toggle', 'sub.toggle@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(711, 'User Sub Conc Renewal Diff', 'sub.conc.renew.diff@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE'),
		(712, 'User Sub Conc Renewal Same', 'sub.conc.renew.same@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET role = 'ORGANIZER';
	`
	if _, err := db.ExecContext(ctx, cleanupSQL); err != nil {
		t.Fatalf("Lỗi chuẩn bị fixtures Pha 3: %v", err)
	}

	// 1. TEST CASE 1: VÍ KHÔNG ĐỦ TIỀN (INT64)
	t.Run("TC1_Insufficient_Balance_Reject", func(t *testing.T) {
		const uID = 701
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 50000, 'VND', 'ACTIVE')", uID)

		req := ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-fail-insufficient-pro",
		}
		_, err := tRepo.SubscribeOrUpgrade(ctx, uID, req)
		if err == nil {
			t.Fatalf("Kỳ vọng bị chặn do ví không đủ 299k (chỉ có 50k), nhưng lại thành công!")
		}
		if !strings.Contains(err.Error(), "số dư ví không đủ") {
			t.Fatalf("Lỗi không chứa 'số dư ví không đủ': %v", err)
		}

		var balStr string
		_ = db.QueryRowContext(ctx, "SELECT balance::text FROM wallet WHERE user_id = $1", uID).Scan(&balStr)
		if !strings.HasPrefix(balStr, "50000") {
			t.Fatalf("Số dư ví bị thay đổi sai lệch: %v", balStr)
		}
		t.Logf("✅ TC1 Đạt: Chặn thành công mua gói khi số dư ví không đủ (50k < 299k), ví giữ nguyên 50.000 đ")
	})

	// 2. TEST CASE 2: IDEMPOTENCY THEO REQUEST_ID & RACE (b) 5 GOROUTINE MUA MỚI KHÁC REQUEST_ID => 1 THÀNH CÔNG, 4 CONFLICT 409
	t.Run("TC2_Idempotency_And_Concurrent_New_Purchase_Conflict", func(t *testing.T) {
		const uID = 702
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 2000000, 'VND', 'ACTIVE')", uID)

		reqID := "req-idempotent-replay-001"
		req := ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: reqID,
		}

		// Lần 1: Mua thành công
		resp1, err1 := tRepo.SubscribeOrUpgrade(ctx, uID, req)
		if err1 != nil {
			t.Fatalf("Lần 1 mua gói thất bại: %v", err1)
		}

		var balAfter1 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID).Scan(&balAfter1)
		if int64(balAfter1) != 2000000-299000 {
			t.Fatalf("Số dư ví sau lần 1 không khớp: %v", balAfter1)
		}

		// Lần 2: Replay cùng request_id => Trả kết quả cũ, KHÔNG trừ tiền ví lần 2
		resp2, err2 := tRepo.SubscribeOrUpgrade(ctx, uID, req)
		if err2 != nil {
			t.Fatalf("Lần 2 replay cùng request_id bị lỗi: %v", err2)
		}
		if resp2.SubscriptionID != resp1.SubscriptionID {
			t.Fatalf("Lần 2 trả subscription_id khác lần 1: %d vs %d", resp2.SubscriptionID, resp1.SubscriptionID)
		}

		var balAfter2 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID).Scan(&balAfter2)
		if int64(balAfter2) != int64(balAfter1) {
			t.Fatalf("Lần 2 replay bị trừ tiền ví lặp lại! Trước: %v, Sau: %v", balAfter1, balAfter2)
		}

		// Race (b): 5 goroutine mua gói mới khác request_id khi chưa có gói => đúng 1 thành công, 4 còn lại nhận 409 Conflict
		const concUID = 709
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 5000000, 'VND', 'ACTIVE')", concUID)

		var wg sync.WaitGroup
		successCount := 0
		conflictCount := 0
		var mu sync.Mutex

		startChan := make(chan struct{})
		for i := 1; i <= 5; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-startChan
				cReq := ticketModels.SubscribeRequest{
					TierCode:  "PRO",
					RequestID: fmt.Sprintf("req-buy-diff-%d", idx),
				}
				r, err := tRepo.SubscribeOrUpgrade(ctx, concUID, cReq)
				mu.Lock()
				defer mu.Unlock()
				if err == nil && r != nil {
					successCount++
				} else if err != nil && (strings.Contains(err.Error(), "xung đột") || strings.Contains(err.Error(), "409") || strings.Contains(err.Error(), "uq_user_active_subscription")) {
					conflictCount++
				}
			}(i)
		}
		close(startChan)
		wg.Wait()

		if successCount != 1 || conflictCount != 4 {
			t.Fatalf("Race (b) thất bại: Kỳ vọng 1 thành công, 4 conflict 409 khi 5 goroutines mua mới đồng thời; nhận: success=%d, conflict=%d", successCount, conflictCount)
		}

		var balConc float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", concUID).Scan(&balConc)
		if int64(balConc) != 5000000-299000 {
			t.Fatalf("Ví User 709 không trừ đúng 1 lần 299k: %v", balConc)
		}

		t.Logf("✅ TC2 Đạt: Idempotency replay giữ nguyên ví; Race (b) 5 goroutines mua mới khác request_id có đúng 1 thành công và 4 bị chặn 409 Conflict!")
	})

	// 3. TEST CASE 3: GIA HẠN CỘNG DỒN END_DATE, RACE (a) 5 GOROUTINE CÙNG REQUEST_ID VÀ RACE (c) 5 GOROUTINE KHÁC REQUEST_ID
	t.Run("TC3_Renew_Same_Tier_Race_Same_And_Diff_RequestId", func(t *testing.T) {
		const uID = 703
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 2000000, 'VND', 'ACTIVE')", uID)

		// Mua gói PRO lần 1 (30 ngày)
		resp1, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-extend-initial",
		})
		if err != nil {
			t.Fatalf("Mua lần 1 thất bại: %v", err)
		}

		initialEndDate := resp1.EndDate

		// Gia hạn lần 1 (+30 ngày) với request_id cụ thể
		renewReqID := "req-extend-renew-001"
		resp2, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: renewReqID,
			Action:    "RENEW",
		})
		if err != nil {
			t.Fatalf("Gia hạn thất bại: %v", err)
		}

		expectedEndDate := initialEndDate.AddDate(0, 0, 30)
		diffSeconds := resp2.EndDate.Sub(expectedEndDate).Seconds()
		if diffSeconds > 2 || diffSeconds < -2 {
			t.Fatalf("EndDate sau gia hạn không khớp cộng dồn 30 ngày! Nhận: %v, Kỳ vọng: %v", resp2.EndDate, expectedEndDate)
		}

		// Replay gia hạn cùng request_id => Không trừ tiền ví thêm
		resp2Replay, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: renewReqID,
			Action:    "RENEW",
		})
		if err != nil {
			t.Fatalf("Replay gia hạn thất bại: %v", err)
		}
		if resp2Replay.SubscriptionID != resp2.SubscriptionID {
			t.Fatalf("Replay gia hạn trả subID khác: %d vs %d", resp2Replay.SubscriptionID, resp2.SubscriptionID)
		}

		var bal float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID).Scan(&bal)
		if int64(bal) != 2000000-299000*2 {
			t.Fatalf("Số dư ví bị trừ sai lệch sau replay gia hạn: %v", bal)
		}

		// Race (a): 5 goroutines gia hạn CÙNG request_id => ví chỉ trừ đúng 1 lần (1 thành công + 4 idempotent)
		const uID712 = 712
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 5000000, 'VND', 'ACTIVE')", uID712)
		_, err = tRepo.SubscribeOrUpgrade(ctx, uID712, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-user712-init",
		})
		if err != nil {
			t.Fatalf("Tạo sub ban đầu cho user 712 thất bại: %v", err)
		}

		var wgSame sync.WaitGroup
		sameSuccess := 0
		var muSame sync.Mutex
		startSameChan := make(chan struct{})

		for i := 1; i <= 5; i++ {
			wgSame.Add(1)
			go func() {
				defer wgSame.Done()
				<-startSameChan
				r, err := tRepo.SubscribeOrUpgrade(ctx, uID712, ticketModels.SubscribeRequest{
					TierCode:  "PRO",
					RequestID: "req-user712-renew-same",
					Action:    "RENEW",
				})
				muSame.Lock()
				defer muSame.Unlock()
				if err == nil && r != nil {
					sameSuccess++
				}
			}()
		}
		close(startSameChan)
		wgSame.Wait()

		if sameSuccess != 5 {
			t.Fatalf("Race (a) thất bại: Kỳ vọng cả 5 goroutines đều nhận kết quả thành công (1 ghi + 4 idempotent), nhận: %d", sameSuccess)
		}

		var bal712 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID712).Scan(&bal712)
		if int64(bal712) != 5000000-299000*2 {
			t.Fatalf("Race (a) ví User 712 bị trừ sai lệch (kỳ vọng trừ đúng 2 kỳ 598k): %v", bal712)
		}

		// Race (c): 5 goroutines gia hạn KHÁC request_id => cộng dồn đúng 5 lần và ví trừ đúng 5 lần
		const uID711 = 711
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 5000000, 'VND', 'ACTIVE')", uID711)
		_, err = tRepo.SubscribeOrUpgrade(ctx, uID711, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-user711-init",
		})
		if err != nil {
			t.Fatalf("Tạo sub ban đầu cho user 711 thất bại: %v", err)
		}

		var wgDiff sync.WaitGroup
		diffSuccess := 0
		var muDiff sync.Mutex
		startDiffChan := make(chan struct{})

		for i := 1; i <= 5; i++ {
			wgDiff.Add(1)
			go func(idx int) {
				defer wgDiff.Done()
				<-startDiffChan
				r, err := tRepo.SubscribeOrUpgrade(ctx, uID711, ticketModels.SubscribeRequest{
					TierCode:  "PRO",
					RequestID: fmt.Sprintf("req-user711-renew-diff-%d", idx),
					Action:    "RENEW",
				})
				muDiff.Lock()
				defer muDiff.Unlock()
				if err == nil && r != nil {
					diffSuccess++
				}
			}(i)
		}
		close(startDiffChan)
		wgDiff.Wait()

		if diffSuccess != 5 {
			t.Fatalf("Race (c) thất bại: Kỳ vọng 5 gia hạn khác request_id đều thành công, nhận: %d", diffSuccess)
		}

		var totalPaid711 int64
		_ = db.QueryRowContext(ctx, "SELECT amount_paid_vnd FROM user_subscription WHERE user_id = $1 AND status = 'ACTIVE'", uID711).Scan(&totalPaid711)
		if totalPaid711 != 299000*6 {
			t.Fatalf("Race (c) User 711 tổng tiền 6 kỳ (1 mua + 5 gia hạn) không khớp: %d", totalPaid711)
		}

		var bal711 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID711).Scan(&bal711)
		if int64(bal711) != 5000000-299000*6 {
			t.Fatalf("Race (c) ví User 711 bị trừ sai: %v", bal711)
		}

		t.Logf("✅ TC3 Đạt: Race (a) 5 goroutines cùng request_id chỉ trừ ví 1 lần; Race (c) 5 goroutines khác request_id cộng dồn chính xác 5 lần!")
	})

	// 4. TEST CASE 4: NÂNG CẤP GIỮA KỲ (PRORATE credit = oldPrice * D / 30)
	t.Run("TC4_Upgrade_Prorate_Between_Tiers", func(t *testing.T) {
		const uID = 704
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 3000000, 'VND', 'ACTIVE')", uID)

		// Giả lập người dùng đã dùng gói PRO được 10 ngày (còn lại đúng 20 ngày)
		// PRO giá 299.000 đ.
		// Prorate credit = (299.000 * 20) / 30 = 5.980.000 / 30 = 199.333 đ (int64 floor sau khi nhân).
		// BUSINESS giá 1.000.000 đ.
		// Amount to pay = 1.000.000 - 199.333 = 800.667 đ.
		now := time.Now()
		oldStart := now.AddDate(0, 0, -10)
		oldEnd := now.AddDate(0, 0, 20)

		var oldSubID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, (SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'), 'ACTIVE', $2, $3, 299000, NOW(), NOW())
			RETURNING subscription_id
		`, uID, oldStart, oldEnd).Scan(&oldSubID)
		if err != nil {
			t.Fatalf("Lỗi tạo fixture gói PRO cũ: %v", err)
		}

		// Nâng cấp lên BUSINESS
		resp, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "BUSINESS",
			RequestID: "req-upgrade-to-business",
		})
		if err != nil {
			t.Fatalf("Nâng cấp lên BUSINESS thất bại: %v", err)
		}

		if resp.TierCode != "BUSINESS" {
			t.Fatalf("TierCode mới không phải BUSINESS: %s", resp.TierCode)
		}
		if resp.ProratedCredit != 199333 {
			t.Fatalf("ProratedCredit không khớp công thức (299000 * 20 / 30 = 199333): nhận %d", resp.ProratedCredit)
		}
		if resp.AmountPaid != 800667 {
			t.Fatalf("AmountPaid không khớp (1000000 - 199333 = 800667): nhận %d", resp.AmountPaid)
		}

		// Kiểm tra trạng thái gói cũ chuyển UPGRADED
		var oldStatus string
		_ = db.QueryRowContext(ctx, "SELECT status FROM user_subscription WHERE subscription_id = $1", oldSubID).Scan(&oldStatus)
		if oldStatus != "UPGRADED" {
			t.Fatalf("Gói cũ không chuyển sang trạng thái UPGRADED: %s", oldStatus)
		}

		// Kiểm tra số dư ví trừ đúng 800.667 đ
		var bal float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID).Scan(&bal)
		if int64(bal) != 3000000-800667 {
			t.Fatalf("Số dư ví không khớp sau nâng cấp: nhận %v, kỳ vọng %d", bal, 3000000-800667)
		}
		t.Logf("✅ TC4 Đạt: Nâng cấp PRO -> BUSINESS khấu trừ chính xác ProratedCredit=%d đ, thanh toán=%d đ, gói cũ chuyển UPGRADED!",
			resp.ProratedCredit, resp.AmountPaid)
	})

	// 5. TEST CASE 5: HẠ CẤP (ĐẶT LỊCH KỲ KẾ, KHÔNG HOÀN TIỀN)
	t.Run("TC5_Downgrade_Schedule_Next_Period", func(t *testing.T) {
		const uID = 705
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 2000000, 'VND', 'ACTIVE')", uID)

		// Người dùng đang dùng BUSINESS
		resp, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "BUSINESS",
			RequestID: "req-downgrade-init",
		})
		if err != nil {
			t.Fatalf("Mua gói BUSINESS ban đầu thất bại: %v", err)
		}

		// Yêu cầu hạ cấp về PRO qua SubscribeOrUpgrade hoặc ScheduleDowngrade
		downgradeResp, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-downgrade-action",
		})
		if err != nil {
			t.Fatalf("Yêu cầu hạ cấp thất bại: %v", err)
		}

		if downgradeResp.AmountPaid != 0 || downgradeResp.ProratedCredit != 0 {
			t.Fatalf("Hạ cấp không được phát sinh hoàn tiền/thanh toán ngay: AmountPaid=%d, Credit=%d",
				downgradeResp.AmountPaid, downgradeResp.ProratedCredit)
		}

		// Kiểm tra trong DB: gói hiện tại vẫn ACTIVE, có scheduled_downgrade_tier_id trỏ về PRO
		var (
			subStatus   string
			schedTierID sql.NullInt64
		)
		err = db.QueryRowContext(ctx, `
			SELECT status, scheduled_downgrade_tier_id 
			FROM user_subscription WHERE subscription_id = $1
		`, resp.SubscriptionID).Scan(&subStatus, &schedTierID)
		if err != nil || subStatus != "ACTIVE" || !schedTierID.Valid {
			t.Fatalf("Lỗi trạng thái gói sau khi đặt lịch hạ cấp: status=%s, schedTierID=%v", subStatus, schedTierID)
		}

		var schedCode string
		_ = db.QueryRowContext(ctx, "SELECT tier_code FROM subscription_tier WHERE tier_id = $1", schedTierID.Int64).Scan(&schedCode)
		if schedCode != "PRO" {
			t.Fatalf("Gói hạ cấp lên lịch không phải PRO: %s", schedCode)
		}
		t.Logf("✅ TC5 Đạt: Hạ cấp BUSINESS -> PRO được lên lịch thành công cho kỳ kế, gói hiện tại giữ nguyên ACTIVE đến hết hạn!")
	})

	// 6. TEST CASE 6: JOB HẾT HẠN & AUTO-RENEW (CHẠY 2 LẦN LIÊN TIẾP KHÔNG TRỪ VÍ 2 LẦN)
	t.Run("TC6_Job_Expired_And_Auto_Renew", func(t *testing.T) {
		// Nhánh A: User 706 (gói PRO hết hạn, auto_renew=true, ví có 500k => tự gia hạn thành công)
		const uID706 = 706
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 500000, 'VND', 'ACTIVE')", uID706)
		_, _ = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, (SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'), 'ACTIVE', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day', TRUE, 299000, NOW(), NOW())
		`, uID706)

		// Nhánh B: User 707 (gói PRO hết hạn, auto_renew=true, ví chỉ có 10k => rơi về FREE, không cấp miễn phí)
		const uID707 = 707
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 10000, 'VND', 'ACTIVE')", uID707)
		_, _ = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, (SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'), 'ACTIVE', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day', TRUE, 299000, NOW(), NOW())
		`, uID707)

		// Chạy production job lần 1
		expired1, renewed1, err1 := sched.RunOnce(ctx)
		if err1 != nil {
			t.Fatalf("Scheduler RunOnce lần 1 thất bại: %v", err1)
		}
		if expired1 < 2 || renewed1 != 1 {
			t.Fatalf("Lần 1 kỳ vọng 2 expired, 1 renewed, nhận: expired=%d, renewed=%d", expired1, renewed1)
		}

		// Kiểm tra User 706 sau lần 1: Ví còn 201k
		var bal706 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID706).Scan(&bal706)
		if int64(bal706) != 500000-299000 {
			t.Fatalf("Ví User 706 không trừ đúng 299k: %v", bal706)
		}

		// Chạy production job lần 2 liên tiếp => 0 expired, 0 renewed, không trừ ví lặp lại
		expired2, renewed2, err2 := sched.RunOnce(ctx)
		if err2 != nil {
			t.Fatalf("Scheduler RunOnce lần 2 thất bại: %v", err2)
		}
		if expired2 != 0 || renewed2 != 0 {
			t.Fatalf("Lần 2 kỳ vọng 0 expired, 0 renewed, nhận: expired=%d, renewed=%d", expired2, renewed2)
		}

		var bal706After2 float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID706).Scan(&bal706After2)
		if int64(bal706After2) != 500000-299000 {
			t.Fatalf("Ví User 706 bị trừ tiền lặp lại ở lần 2! %v", bal706After2)
		}

		t.Logf("✅ TC6 Đạt: Job xử lý 2 gói hết hạn, 1 gia hạn thành công; Chạy lần 2 liên tiếp trả về 0 expired / 0 renewed và không trừ ví lặp lại!")
	})

	// 7. TEST CASE 7: TIER BỊ TẮT (IS_ACTIVE = FALSE)
	t.Run("TC7_Disabled_Tier_Protection", func(t *testing.T) {
		const uID = 708
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 2000000, 'VND', 'ACTIVE')", uID)

		// Tạm thời vô hiệu hóa gói BUSINESS (is_active = FALSE)
		_, _ = db.ExecContext(ctx, "UPDATE subscription_tier SET is_active = FALSE WHERE tier_code = 'BUSINESS'")
		defer func() {
			_, _ = db.ExecContext(ctx, "UPDATE subscription_tier SET is_active = TRUE WHERE tier_code = 'BUSINESS'")
		}()

		// Thử mua gói BUSINESS bị tắt => BỊ CHẶN
		_, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "BUSINESS",
			RequestID: "req-buy-disabled-tier",
		})
		if err == nil {
			t.Fatalf("Kỳ vọng bị chặn khi mua gói đã bị vô hiệu hóa (is_active=FALSE), nhưng lại thành công!")
		}
		if !strings.Contains(err.Error(), "vô hiệu hóa") && !strings.Contains(err.Error(), "không tồn tại") {
			t.Fatalf("Lỗi không chứa thông báo vô hiệu hóa: %v", err)
		}

		// Giả lập user đang có gói BUSINESS còn hạn lúc trước khi bị tắt => Vẫn giữ quyền lợi đến hết kỳ
		now := time.Now()
		_, _ = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, (SELECT tier_id FROM subscription_tier WHERE tier_code = 'BUSINESS'), 'ACTIVE', $2, $3, 1000000, NOW(), NOW())
		`, uID, now.Add(-5*24*time.Hour), now.Add(25*24*time.Hour))

		currSub, err := tRepo.GetCurrentSubscription(ctx, uID)
		if err != nil {
			t.Fatalf("Lỗi đọc gói hiện tại: %v", err)
		}
		if currSub.TierCode != "BUSINESS" || currSub.Status != "ACTIVE" {
			t.Fatalf("User đang ACTIVE với gói bị tắt phải tiếp tục hưởng quyền lợi đến hết kỳ, nhận: %+v", currSub)
		}

		t.Logf("✅ TC7 Đạt: Tier is_active=FALSE chặn mua mới thành công; người dùng đang ACTIVE tiếp tục được bảo toàn quyền lợi đến hết kỳ!")
	})

	// 8. TEST CASE 8: BẬT / TẮT AUTO_RENEW QUA API
	t.Run("TC8_SetAutoRenew_Toggle", func(t *testing.T) {
		const uID = 710
		_, _ = db.ExecContext(ctx, "INSERT INTO wallet (user_id, balance, currency, status) VALUES ($1, 2000000, 'VND', 'ACTIVE')", uID)

		// Mua gói ban đầu với auto_renew = false
		_, err := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-init-autorenew-toggle",
		})
		if err != nil {
			t.Fatalf("Mua gói PRO ban đầu thất bại: %v", err)
		}

		subBefore, err := tRepo.GetCurrentSubscription(ctx, uID)
		if err != nil || subBefore.AutoRenew != false {
			t.Fatalf("AutoRenew ban đầu phải là false: %+v", subBefore)
		}

		// Bật auto_renew = true
		err = tRepo.SetAutoRenew(ctx, uID, true)
		if err != nil {
			t.Fatalf("Bật auto_renew thất bại: %v", err)
		}

		subAfter1, err := tRepo.GetCurrentSubscription(ctx, uID)
		if err != nil || subAfter1.AutoRenew != true {
			t.Fatalf("AutoRenew sau khi bật phải là true: %+v", subAfter1)
		}

		// Tắt auto_renew = false
		err = tRepo.SetAutoRenew(ctx, uID, false)
		if err != nil {
			t.Fatalf("Tắt auto_renew thất bại: %v", err)
		}

		subAfter2, err := tRepo.GetCurrentSubscription(ctx, uID)
		if err != nil || subAfter2.AutoRenew != false {
			t.Fatalf("AutoRenew sau khi tắt phải là false: %+v", subAfter2)
		}

		t.Logf("✅ TC8 Đạt: Bật và tắt auto_renew thành công, phản ánh chính xác 100%% trong GetCurrentSubscription!")
	})

	// 9. TEST CASE 9: KIỂM TRA CÁC NHÁNH LỖI FAIL-CLOSED VÀ ROLLBACK
	t.Run("TC9_Error_Branches_FailClosed_And_Rollback", func(t *testing.T) {
		const uID = 715
		// Canceled context khi gọi ProcessExpiredSubscriptions => Phải trả về error và rollback, không đánh EXPIRED âm thầm
		canceledCtx, cancel := context.WithCancel(context.Background())
		cancel() // Cancel ngay lập tức

		_, _, err := tRepo.ProcessExpiredSubscriptions(canceledCtx)
		if err == nil {
			t.Fatalf("ProcessExpiredSubscriptions với canceled context phải trả về error nhưng lại thành công!")
		}
		t.Logf("✅ TC9 Đạt: ProcessExpiredSubscriptions bắt lỗi context/DB fail-closed chính xác: %v", err)
	})
}
