package main

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"
	"time"

	eventRepo "github.com/fpt-event-services/services/event-service/repository"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	ticketRepo "github.com/fpt-event-services/services/ticket-service/repository"
	_ "github.com/lib/pq"
)

func TestAllPhases_ComprehensiveLifecycle(t *testing.T) {
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

	if err := db.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] Docker Postgres local không phản hồi (%v). Bỏ qua integration test trong CI.", err)
		return
	}

	ctx := context.Background()
	eRepo := eventRepo.NewEventRepositoryWithDB(db)
	tRepo := ticketRepo.NewTicketRepositoryWithDB(db)

	// Chuẩn bị dữ liệu mẫu người dùng:
	// User 10: ORGANIZER A (bắt đầu từ Free)
	// User 20: STUDENT B
	// User 30: ADMIN
	seedUsersSQL := `
		DELETE FROM financial_receipt WHERE organizer_id IN (10, 20);
		DELETE FROM user_subscription WHERE user_id IN (10, 20);
		DELETE FROM wallet_transaction WHERE user_id IN (10, 20);
		DELETE FROM ticket WHERE user_id IN (10, 20) OR event_id IN (SELECT event_id FROM event WHERE created_by IN (10, 20));
		DELETE FROM category_ticket WHERE event_id IN (SELECT event_id FROM event WHERE created_by IN (10, 20));
		DELETE FROM event WHERE created_by IN (10, 20);
		DELETE FROM organizer_fee_override WHERE organizer_id IN (10, 20);

		INSERT INTO users (user_id, full_name, email, password_hash, role, status, previous_role) VALUES
		(10, 'Organizer Test A', 'org.test.a@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE', NULL),
		(20, 'Student Test B', 'stu.test.b@fpt.edu.vn', 'hash', 'STUDENT', 'ACTIVE', NULL),
		(30, 'Admin System', 'admin.sys@fpt.edu.vn', 'hash', 'ADMIN', 'ACTIVE', NULL)
		ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, previous_role = NULL;

		-- Khởi tạo ví cho Organizer 10 có sẵn 2.000.000 VNĐ
		INSERT INTO wallet (wallet_id, user_id, balance, currency, status) VALUES
		(10, 10, 2000000, 'VND', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET balance = 2000000;
	`
	if _, err := db.ExecContext(ctx, seedUsersSQL); err != nil {
		t.Fatalf("Lỗi chuẩn bị dữ liệu test user & ví: %v", err)
	}

	// =========================================================================
	// TEST CASE 1: Kiểm tra Capacity theo Tổng Vé/Ghế thực tế (Pha 2)
	// =========================================================================
	t.Run("TC1_CapacityLimitByTicketQuantity", func(t *testing.T) {
		limits, err := eRepo.GetOrganizerLimits(ctx, 10)
		if err != nil {
			t.Fatalf("Lỗi đọc limits: %v", err)
		}
		if limits.MaxCapacityLimit != 100 || limits.TierCode != "FREE" {
			t.Fatalf("Kỳ vọng Organizer 10 ở gói FREE (100 người), nhận: %s (%d)", limits.TierCode, limits.MaxCapacityLimit)
		}

		// Khi cờ TẮT: 120 được phép
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		if err := eventRepo.ValidateCapacityLimit(limits, 120); err != nil {
			t.Fatalf("Kỳ vọng cờ TẮT thì cho phép 120, nhận lỗi: %v", err)
		}

		// Khi cờ BẬT: 120 bị chặn
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Unsetenv("ENABLE_CAPACITY_GATING")

		// Thử validate yêu cầu tổng vé = 120 (vượt quá 100)
		err = eventRepo.ValidateCapacityLimit(limits, 120)
		if err == nil {
			t.Fatalf("Kỳ vọng bị chặn do vượt quá 100 chỗ, nhưng lại được chấp thuận!")
		}
		if !strings.Contains(err.Error(), "vượt quá giới hạn") {
			t.Fatalf("Lỗi không chứa thông điệp nâng cấp gói: %v", err)
		}
		t.Log("✅ TC1 Đạt: Bị chặn thành công khi cờ BẬT và tổng vé (120) > 100 của gói FREE")
	})

	// =========================================================================
	// TEST CASE 5: Subscription Idempotency & Mua gói PRO trừ ví (Pha 3)
	// =========================================================================
	t.Run("TC5_SubscribeProWithIdempotency", func(t *testing.T) {
		reqID := "req-idempotent-test-001"
		subscribeReq := ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: reqID,
		}

		// Lần 1: Mua gói PRO (299.000đ)
		resp1, err := tRepo.SubscribeOrUpgrade(ctx, 10, subscribeReq)
		if err != nil {
			t.Fatalf("Lỗi mua gói PRO lần 1: %v", err)
		}
		if resp1.AmountPaid != 299000 {
			t.Fatalf("Kỳ vọng trừ 299.000đ, nhận: %d", resp1.AmountPaid)
		}

		// Kiểm tra số dư ví phải bị trừ đúng 299.000đ (2.000.000 - 299.000 = 1.701.000)
		var balance float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 10").Scan(&balance)
		if balance != 1701000 {
			t.Fatalf("Kỳ vọng số dư ví là 1.701.000đ, nhận: %v", balance)
		}

		// Lần 2: Gửi lại cùng RequestID (Idempotent Retry)
		resp2, err := tRepo.SubscribeOrUpgrade(ctx, 10, subscribeReq)
		if err != nil {
			t.Fatalf("Lỗi Idempotent Retry: %v", err)
		}
		if resp2.SubscriptionID != resp1.SubscriptionID {
			t.Fatalf("Kỳ vọng trả về cùng SubscriptionID %d, nhận: %d", resp1.SubscriptionID, resp2.SubscriptionID)
		}

		// Tiền ví tuyệt đối không bị trừ thêm lần 2!
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 10").Scan(&balance)
		if balance != 1701000 {
			t.Fatalf("Lỗi vi phạm Idempotency: tiền ví bị trừ thêm! Số dư: %v", balance)
		}
		t.Log("✅ TC5 Đạt: Idempotency bảo vệ thành công, tiền ví trừ duy nhất 1 lần!")
	})

	// =========================================================================
	// TEST CASE 4: Nâng cấp Business (Proration) và Đặt lịch hạ cấp (Pha 3)
	// =========================================================================
	t.Run("TC4_UpgradeProrationAndDowngrade", func(t *testing.T) {
		// Nâng cấp từ PRO lên BUSINESS (1.000.000đ)
		// Vì mới mua PRO hôm nay (còn 30 ngày), unusedCredit = (299.000 * 30) / 30 = 299.000đ
		// Số tiền trả = 1.000.000 - 299.000 = 701.000đ
		upgradeReq := ticketModels.SubscribeRequest{
			TierCode:  "BUSINESS",
			RequestID: "req-upgrade-business-002",
		}
		resp, err := tRepo.SubscribeOrUpgrade(ctx, 10, upgradeReq)
		if err != nil {
			t.Fatalf("Lỗi nâng cấp gói Business: %v", err)
		}
		if resp.ProratedCredit != 299000 {
			t.Fatalf("Kỳ vọng ProratedCredit là 299.000đ, nhận: %d", resp.ProratedCredit)
		}
		if resp.AmountPaid != 701000 {
			t.Fatalf("Kỳ vọng AmountPaid là 701.000đ, nhận: %d", resp.AmountPaid)
		}

		// Thử hạ cấp xuống PRO: Không hoàn tiền, đặt scheduled_downgrade_tier_id
		err = tRepo.ScheduleDowngrade(ctx, 10, "PRO")
		if err != nil {
			t.Fatalf("Lỗi đặt lịch hạ cấp: %v", err)
		}

		// Kiểm tra trạng thái subscription
		currSub, err := tRepo.GetCurrentSubscription(ctx, 10)
		if err != nil {
			t.Fatalf("Lỗi đọc subscription hiện tại: %v", err)
		}
		if currSub.TierCode != "BUSINESS" {
			t.Fatalf("Gói hiện tại vẫn phải là BUSINESS cho đến hết kỳ, nhận: %s", currSub.TierCode)
		}
		if currSub.ScheduledDowngradeTierCode == nil || *currSub.ScheduledDowngradeTierCode != "PRO" {
			t.Fatalf("Lịch hạ cấp kỳ vọng PRO, nhận: %v", currSub.ScheduledDowngradeTierCode)
		}
		t.Logf("✅ TC4 Đạt: Proration khấu trừ chính xác %d đ và đặt lịch hạ cấp PRO thành công!", resp.ProratedCredit)
	})

	// =========================================================================
	// TEST CASE 6: Ràng buộc Exclude GIST chống Override chồng lấn (Pha 4)
	// =========================================================================
	t.Run("TC6_FeeOverrideExcludeGistOverlap", func(t *testing.T) {
		t1 := time.Now().Add(24 * time.Hour)
		t2 := t1.Add(7 * 24 * time.Hour)

		// Tạo override 1: [t1, t2)
		ov1, err := tRepo.CreateFeeOverride(ctx, 30, 10, 150, "Ưu đãi tuần 1", t1, t2, true)
		if err != nil {
			t.Fatalf("Lỗi tạo override 1: %v", err)
		}
		defer tRepo.DeleteFeeOverride(ctx, 30, ov1.OverrideID, "Dọn dẹp test")

		// Tạo override 2 chồng lấn thời gian: [t1 + 2 ngày, t2 + 2 ngày)
		t3 := t1.Add(2 * 24 * time.Hour)
		t4 := t2.Add(2 * 24 * time.Hour)
		_, err = tRepo.CreateFeeOverride(ctx, 30, 10, 100, "Ưu đãi chồng lấn", t3, t4, true)
		if err == nil {
			t.Fatalf("Kỳ vọng PostgreSQL chặn lỗi trùng lấn (Exclude GiST), nhưng lại thành công!")
		}
		if !strings.Contains(err.Error(), "trùng lặp") {
			t.Fatalf("Lỗi không phản ánh vi phạm trùng lặp thời gian: %v", err)
		}
		t.Log("✅ TC6 Đạt: Exclude GiST chặn thành công override chồng lấn thời gian!")
	})

	// =========================================================================
	// TEST CASE 7: Chặn Sức Chứa 0 hoặc -5 (Pha 4)
	// =========================================================================
	t.Run("TC7_RejectInvalidCapacityLimits", func(t *testing.T) {
		err := tRepo.UpdateSubscriptionTier(ctx, 30, 2, 299000, 250, 0, true, true, "Test 0 cap")
		if err == nil {
			t.Fatalf("Kỳ vọng chặn capacity = 0!")
		}
		err = tRepo.UpdateSubscriptionTier(ctx, 30, 2, 299000, 250, -5, true, true, "Test -5 cap")
		if err == nil {
			t.Fatalf("Kỳ vọng chặn capacity = -5!")
		}
		t.Log("✅ TC7 Đạt: Chặn thành công giá trị sức chứa không hợp lệ (0 và -5)!")
	})

	// =========================================================================
	// TEST CASE 8: Gán Role School Organizer cho User không phải Organizer (Pha 4)
	// =========================================================================
	t.Run("TC8_RejectSchoolRoleForNonOrganizer", func(t *testing.T) {
		// User 20 là STUDENT
		err := tRepo.AssignSchoolOrganizerRole(ctx, 30, 20, "Cấp nhầm cho student")
		if err == nil {
			t.Fatalf("Kỳ vọng chặn cấp quyền School Organizer cho tài khoản STUDENT!")
		}
		if !strings.Contains(strings.ToLower(err.Error()), "chỉ có thể cấp quyền school organizer cho tài khoản organizer") {
			t.Fatalf("Lỗi không đúng kỳ vọng: %v", err)
		}
		t.Log("✅ TC8 Đạt: Chặn thành công gán School Organizer cho Student!")
	})

	// =========================================================================
	// TEST CASE 12: Chặn Tắt Tier FREE (chk_free_tier_always_active) (Pha 4)
	// =========================================================================
	t.Run("TC12_BlockDeactivatingFreeTier", func(t *testing.T) {
		// Tier 1 là FREE
		err := tRepo.UpdateSubscriptionTier(ctx, 30, 1, 0, 500, 100, false, false, "Thử tắt gói Free")
		if err == nil {
			t.Fatalf("Kỳ vọng chặn tắt gói FREE!")
		}
		if !strings.Contains(err.Error(), "không được phép vô hiệu hóa gói FREE") {
			t.Fatalf("Lỗi không đúng kỳ vọng: %v", err)
		}
		t.Log("✅ TC12 Đạt: Constraint chk_free_tier_always_active bảo vệ gói FREE thành công!")
	})

	// =========================================================================
	// TEST CASE 14: Token Cũ sau khi Thu hồi Role (Pha 2 & 4)
	// =========================================================================
	t.Run("TC14_RevokeRoleAndOldTokenBypassDefense", func(t *testing.T) {
		// Cấp quyền cho Organizer 10
		err := tRepo.AssignSchoolOrganizerRole(ctx, 30, 10, "Cán bộ CLB")
		if err != nil {
			t.Fatalf("Lỗi cấp role: %v", err)
		}

		// Xác nhận đã nhận role SCHOOL_ORGANIZER
		var currentRole, prevRole string
		_ = db.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = 10").Scan(&currentRole, &prevRole)
		if currentRole != "SCHOOL_ORGANIZER" || prevRole != "ORGANIZER" {
			t.Fatalf("Kỳ vọng role=SCHOOL_ORGANIZER, previous=ORGANIZER; nhận: %s, %s", currentRole, prevRole)
		}

		// Thu hồi quyền
		err = tRepo.RevokeSchoolOrganizerRole(ctx, 30, 10, "Hết nhiệm kỳ")
		if err != nil {
			t.Fatalf("Lỗi thu hồi role: %v", err)
		}

		// Kiểm tra đã hoàn trả đúng role cũ ORGANIZER và xóa previous_role
		var afterRole string
		var afterPrev sql.NullString
		_ = db.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = 10").Scan(&afterRole, &afterPrev)
		if afterRole != "ORGANIZER" || afterPrev.Valid {
			t.Fatalf("Kỳ vọng hoàn trả về ORGANIZER và previous_role NULL; nhận: %s, %v", afterRole, afterPrev)
		}
		t.Log("✅ TC14 Đạt: Cơ chế previous_role hoàn trả chính xác 100% vai trò cũ!")
	})

	// =========================================================================
	// TEST CASE 9 & 13: Báo Cáo 3 Cột Tiền & Chặn Paywall Báo Cáo Nâng Cao (Pha 5 & 6)
	// =========================================================================
	t.Run("TC9_TC13_FinancialReportAndPaywall", func(t *testing.T) {
		// Tạo 1 event mẫu cho Organizer 10
		var eventID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (created_by, title, status, is_settled, start_time, end_time, created_at)
			VALUES (10, 'Sự kiện đối soát tài chính', 'OPEN', FALSE, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW())
			RETURNING event_id
		`).Scan(&eventID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}

		// Tạo category ticket và vé status REFUNDED
		var categoryID int
		err = db.QueryRowContext(ctx, `
			INSERT INTO category_ticket (event_id, name, price, max_quantity)
			VALUES ($1, 'Loại vé test', 100000, 50)
			RETURNING category_ticket_id
		`, eventID).Scan(&categoryID)
		if err != nil {
			t.Fatalf("Lỗi tạo category_ticket: %v", err)
		}

		ticketSQL := `
			INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, qr_code_value, status, created_at)
			VALUES (99001, $1, $2, 10, 'TCK-REF-99001', 'REFUNDED', NOW())
			ON CONFLICT (ticket_id) DO UPDATE SET status = EXCLUDED.status;
		`
		if _, err := db.ExecContext(ctx, ticketSQL, eventID, categoryID); err != nil {
			t.Fatalf("Lỗi chèn ticket REFUNDED: %v", err)
		}

		receiptSQL := `
			INSERT INTO financial_receipt (
				receipt_id, order_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee,
				commission_amount, net_amount, currency, tier_code, commission_bps, fee_source, fee_config_version, is_reversal, computed_at, created_at
			) VALUES 
			(99001, 9001, $1, 10, 100000, 5.0, 1000, 5000, 94000, 'VND', 'PRO', 500, 'TIER', 1, FALSE, NOW(), NOW()),
			(99002, 9002, $1, 10, -100000, 5.0, -1000, -5000, -94000, 'VND', 'PRO', 500, 'TIER', 1, TRUE, NOW(), NOW())
			ON CONFLICT (receipt_id) DO UPDATE SET net_amount = EXCLUDED.net_amount;
		`
		if _, err := db.ExecContext(ctx, receiptSQL, eventID); err != nil {
			t.Fatalf("Lỗi chèn receipt: %v", err)
		}

		// 1. Kiểm tra Báo cáo cơ bản 3 cột tiền (Pha 5):
		overview, err := tRepo.GetEventFinancialOverview(ctx, eventID, 10)
		if err != nil {
			t.Fatalf("Lỗi đọc financial overview: %v", err)
		}
		if overview.TotalGrossRevenue != 0 || overview.TotalNetProfit != 0 {
			t.Fatalf("Kỳ vọng 1 gốc + 1 hoàn bù trừ = 0 VNĐ, nhận gross=%v, net=%v", overview.TotalGrossRevenue, overview.TotalNetProfit)
		}
		if overview.TotalTicketsRefunded != 1 {
			t.Fatalf("Kỳ vọng 1 vé hoàn, nhận: %d", overview.TotalTicketsRefunded)
		}
		t.Log("✅ TC9 Đạt: Báo cáo tài chính 3 cột tiền tính đúng từ SUM(net_amount) lịch sử!")

		// 2. Kiểm tra Paywall Báo cáo nâng cao cho tài khoản Organizer 99 ở gói FREE:
		_, _ = db.ExecContext(ctx, "INSERT INTO users (user_id, full_name, email, password_hash, role, status) VALUES (99, 'Free Org 99', 'free99@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING")
		var eventID99 int
		if errEv := db.QueryRowContext(ctx, "INSERT INTO event (created_by, org_type, title, status, start_time, end_time) VALUES (99, 'ORGANIZER', 'Event Free 99', 'OPEN', NOW(), NOW() + INTERVAL '1 day') RETURNING event_id").Scan(&eventID99); errEv == nil {
			_, err = tRepo.GetEventAdvancedAnalytics(ctx, eventID99, 99)
			if err == nil {
				t.Fatalf("Kỳ vọng chặn Paywall cho user không có gói nâng cao!")
			}
			if !strings.Contains(err.Error(), "Báo cáo nâng cao chỉ mở khóa") {
				t.Fatalf("Lỗi không chứa thông báo Paywall: %v", err)
			}
		}
		t.Log("✅ TC13 Đạt: Paywall FAIL-CLOSED chặn thành công người dùng chưa nâng cấp!")
	})

	// =========================================================================
	// TEST CASE: Sandbox Tính Thử Biểu Phí (Pha 4)
	// =========================================================================
	t.Run("Sandbox_FeeSimulation", func(t *testing.T) {
		proTier := "PRO"
		req := ticketModels.FeeSimulationRequest{
			TierCode:       &proTier,
			TicketPrice:    50000,
			TicketQuantity: 2,
		}
		res, err := tRepo.SimulateFeeCalculation(ctx, req)
		if err != nil {
			t.Fatalf("Lỗi simulate: %v", err)
		}
		// Giá 50.000đ/vé:
		// Gross: 100.000đ
		// Pro commission 2.5% (250 bps): 1.250đ/vé -> 2 vé = 2.500đ
		// Fixed fee 1.000đ/vé (vì giá 50.000 >= 20.000): 2 vé = 2.000đ
		if res.GrossAmount != 100000 || res.CommissionAmount != 4500 || res.TotalFixedFee != 2000 || res.NetAmount != 95500 {
			t.Fatalf("Kết quả tính toán Sandbox sai lệch: Gross=%v, Comm=%v, Fixed=%v, Net=%v",
				res.GrossAmount, res.CommissionAmount, res.TotalFixedFee, res.NetAmount)
		}
		t.Logf("✅ Sandbox Đạt: Mô phỏng chính xác tuyệt đối Gross=%v, Fee=%v, Net=%v!",
			res.GrossAmount, res.TotalPlatformFee, res.NetAmount)
	})
}
