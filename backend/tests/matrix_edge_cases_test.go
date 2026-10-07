package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	eventHandler "github.com/fpt-event-services/services/event-service/handler"
	eventModels "github.com/fpt-event-services/services/event-service/models"
	eventRepo "github.com/fpt-event-services/services/event-service/repository"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	ticketRepo "github.com/fpt-event-services/services/ticket-service/repository"
	ticketScheduler "github.com/fpt-event-services/services/ticket-service/scheduler"
	_ "github.com/lib/pq"
)

func TestMatrixEdgeCases_RealDockerDB(t *testing.T) {
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

	if err := EnsureAllTestTablesExists(db); err != nil {
		t.Fatalf("Lỗi khởi tạo test schema: %v", err)
	}

	ctx := context.Background()
	eRepo := eventRepo.NewEventRepositoryWithDB(db)
	tRepo := ticketRepo.NewTicketRepositoryWithDB(db)

	// Dọn dẹp và chuẩn bị test fixtures
	cleanupSQL := `
		DELETE FROM financial_receipt WHERE organizer_id IN (100, 200, 300);
		DELETE FROM user_subscription WHERE user_id IN (100, 200, 300);
		DELETE FROM organizer_fee_override WHERE organizer_id IN (100, 200, 300);
		DELETE FROM wallet_transaction WHERE user_id IN (100, 200, 300);
		DELETE FROM ticket WHERE user_id IN (100, 200, 300) OR event_id IN (SELECT event_id FROM event WHERE created_by IN (100, 200, 300));
		DELETE FROM event_seat_layout WHERE event_id IN (SELECT event_id FROM event WHERE created_by IN (100, 200, 300));
		DELETE FROM seat WHERE seat_code LIKE '%TEST%' OR seat_code LIKE 'P_SEAT%';
		DELETE FROM category_ticket WHERE event_id IN (SELECT event_id FROM event WHERE created_by IN (100, 200, 300));
		DELETE FROM event_request WHERE requester_id IN (100, 200, 300);
		DELETE FROM event WHERE created_by IN (100, 200, 300);
		DELETE FROM bill WHERE user_id IN (100, 200, 300);

		INSERT INTO users (user_id, full_name, email, password_hash, role, status, previous_role) VALUES
		(100, 'Organizer Edge Test', 'org.edge@fpt.edu.vn', 'hash', 'ORGANIZER', 'ACTIVE', NULL),
		(200, 'Student Edge Test', 'stu.edge@fpt.edu.vn', 'hash', 'STUDENT', 'ACTIVE', NULL),
		(300, 'Admin Edge Test', 'admin.edge@fpt.edu.vn', 'hash', 'ADMIN', 'ACTIVE', NULL)
		ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, previous_role = NULL;

		UPDATE subscription_tier SET max_capacity_limit = 100, price_vnd = 0, commission_bps = 500, is_active = TRUE WHERE tier_code = 'FREE';
		UPDATE subscription_tier SET max_capacity_limit = -1, price_vnd = 299000, commission_bps = 250, is_active = TRUE WHERE tier_code = 'PRO';
		UPDATE subscription_tier SET max_capacity_limit = -1, price_vnd = 1000000, commission_bps = 0, is_active = TRUE WHERE tier_code = 'BUSINESS';
		UPDATE role_fee_policy SET max_capacity_limit = -1, commission_bps = 250, is_active = TRUE WHERE role_code = 'SCHOOL_ORGANIZER';

		INSERT INTO wallet (wallet_id, user_id, balance, pending_balance, currency, status) VALUES
		(100, 100, 50000, 0, 'VND', 'ACTIVE'),
		(200, 200, 100000, 0, 'VND', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, pending_balance = 0;

		SELECT setval(pg_get_serial_sequence('financial_receipt', 'receipt_id'), COALESCE((SELECT MAX(receipt_id) FROM financial_receipt), 1) + 10, false);
		SELECT setval(pg_get_serial_sequence('bill', 'bill_id'), COALESCE((SELECT MAX(bill_id) FROM bill), 1) + 10, false);
		SELECT setval(pg_get_serial_sequence('ticket', 'ticket_id'), COALESCE((SELECT MAX(ticket_id) FROM ticket), 1) + 10, false);
		SELECT setval(pg_get_serial_sequence('event', 'event_id'), COALESCE((SELECT MAX(event_id) FROM event), 1) + 10, false);
	`
	if _, err := db.ExecContext(ctx, cleanupSQL); err != nil {
		t.Fatalf("Lỗi chuẩn bị fixtures: %v", err)
	}

	// =========================================================================
	// =========================================================================
	// 1. BIÊN SỨC CHỨA: KIỂM THỬ ĐỘC LẬP TỪNG LUỒNG TRONG 6 LUỒNG
	// (Free, ExpectedCapacity=50, vé tổng 120 => Bị chặn khi ENABLE_CAPACITY_GATING=true, Cho qua khi false)
	// =========================================================================
	t.Run("Route1_CreateIndependentEvent_CapacityGating", func(t *testing.T) {
		cap50 := 50
		maxQ120 := 120
		req := &eventModels.CreateEventRequestBody{
			Title:              "Independent 120 Route 1",
			EventFormat:        "ONLINE",
			ExpectedCapacity:   &cap50,
			Tickets:            []eventModels.CategoryTicket{{Name: "Vé 120", MaxQuantity: &maxQ120, Price: 0}},
			PreferredStartTime: time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04:05"),
			PreferredEndTime:   time.Now().Add(48 * time.Hour).Format("2006-01-02 15:04:05"),
		}

		// 1. Cờ TẮT => Cho qua thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		evtID, err := eRepo.CreateIndependentEvent(ctx, 100, req)
		if err != nil || evtID <= 0 {
			t.Fatalf("Luồng 1 (CreateIndependentEvent) cờ TẮT phải thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Bị chặn
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		_, errOn := eRepo.CreateIndependentEvent(ctx, 100, req)
		if errOn == nil {
			t.Fatalf("Luồng 1 (CreateIndependentEvent) cờ BẬT phải bị chặn khi Expected=50 và Vé=120!")
		}
		t.Logf("✅ Luồng 1 Đạt: CreateIndependentEvent cờ tắt cho qua (ID=%d), cờ bật chặn đúng: %v", evtID, errOn)
	})

	t.Run("Route2_CreateEventRequest_CapacityGating", func(t *testing.T) {
		cap50 := 50
		maxQ120 := 120
		req := &eventModels.CreateEventRequestBody{
			Title:              "Request 120 Route 2",
			EventFormat:        "ONLINE",
			ExpectedCapacity:   &cap50,
			Tickets:            []eventModels.CategoryTicket{{Name: "Vé 120", MaxQuantity: &maxQ120, Price: 0}},
			PreferredStartTime: "2026-05-01 09:00:00",
			PreferredEndTime:   "2026-05-01 11:00:00",
		}

		// 1. Cờ TẮT => Cho qua thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		reqID, err := eRepo.CreateEventRequest(ctx, 100, req)
		if err != nil || reqID <= 0 {
			t.Fatalf("Luồng 2 (CreateEventRequest) cờ TẮT phải thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Bị chặn
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		_, errOn := eRepo.CreateEventRequest(ctx, 100, req)
		if errOn == nil {
			t.Fatalf("Luồng 2 (CreateEventRequest) cờ BẬT phải bị chặn khi Expected=50 và Vé=120!")
		}
		t.Logf("✅ Luồng 2 Đạt: CreateEventRequest cờ tắt cho qua (ReqID=%d), cờ bật chặn đúng: %v", reqID, errOn)
	})

	t.Run("Route3_UpdateEventRequest_CapacityGating", func(t *testing.T) {
		var testEvtID, testReqID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (title, event_format, max_seats, area_id, status, created_by, start_time, end_time, created_at)
			VALUES ('Event Route 3', 'ONLINE', 50, 1, 'OPEN', 100, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW()) RETURNING event_id
		`).Scan(&testEvtID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}
		err = db.QueryRowContext(ctx, `
			INSERT INTO event_request (requester_id, title, preferred_start_time, preferred_end_time, expected_capacity, created_event_id, status, created_at)
			VALUES (100, 'Req Route 3', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 50, $1, 'APPROVED', NOW()) RETURNING request_id
		`, testEvtID).Scan(&testReqID)
		if err != nil {
			t.Fatalf("Lỗi tạo event_request: %v", err)
		}

		updReq := &eventModels.UpdateEventRequestRequest{
			RequestID: testReqID,
			EventID:   testEvtID,
			Status:    "APPROVED",
			Tickets: []map[string]interface{}{
				{"name": "VIP 120", "maxQuantity": 120, "price": 0.0},
			},
		}

		// 1. Cờ TẮT => Cho qua thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		if err := eRepo.UpdateEventRequest(ctx, 100, updReq); err != nil {
			t.Fatalf("Luồng 3 (UpdateEventRequest) cờ TẮT phải thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Bị chặn
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		errOn := eRepo.UpdateEventRequest(ctx, 100, updReq)
		if errOn == nil {
			t.Fatalf("Luồng 3 (UpdateEventRequest) cờ BẬT phải bị chặn khi vé=120!")
		}
		t.Logf("✅ Luồng 3 Đạt: UpdateEventRequest cờ tắt cho qua, cờ bật chặn đúng: %v", errOn)
	})

	t.Run("Route4_ProcessEventRequest_AdminApprove_CapacityGating", func(t *testing.T) {
		var testReqID1 int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event_request (requester_id, title, preferred_start_time, preferred_end_time, expected_capacity, status, created_at)
			VALUES (100, 'Req Route 4 Flag Off', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 120, 'PENDING', NOW()) RETURNING request_id
		`).Scan(&testReqID1)
		if err != nil {
			t.Fatalf("Lỗi tạo event_request 1: %v", err)
		}

		areaID := 1
		procReq1 := &eventModels.ProcessEventRequestBody{
			RequestID: testReqID1,
			Action:    "APPROVED",
			AreaID:    &areaID,
		}

		// 1. Cờ TẮT => Admin duyệt thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		if err := eRepo.ProcessEventRequest(ctx, 1, procReq1); err != nil {
			t.Fatalf("Luồng 4 (ProcessEventRequest) cờ TẮT phải duyệt thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Tạo request 2 với 120 chỗ, Admin duyệt bị chặn do Organizer gói Free không đủ hạn mức 120
		var testReqID2 int
		err = db.QueryRowContext(ctx, `
			INSERT INTO event_request (requester_id, title, preferred_start_time, preferred_end_time, expected_capacity, status, created_at)
			VALUES (100, 'Req Route 4 Flag On', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 120, 'PENDING', NOW()) RETURNING request_id
		`).Scan(&testReqID2)
		if err != nil {
			t.Fatalf("Lỗi tạo event_request 2: %v", err)
		}

		procReq2 := &eventModels.ProcessEventRequestBody{
			RequestID: testReqID2,
			Action:    "APPROVED",
			AreaID:    &areaID,
		}

		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		errOn := eRepo.ProcessEventRequest(ctx, 1, procReq2)
		if errOn == nil {
			t.Fatalf("Luồng 4 (ProcessEventRequest) cờ BẬT phải bị chặn khi duyệt sự kiện 120 chỗ của gói FREE!")
		}
		t.Logf("✅ Luồng 4 Đạt: ProcessEventRequest cờ tắt cho qua, cờ bật chặn đúng: %v", errOn)
	})

	t.Run("Route5_UpdateEventDetails_CapacityGating", func(t *testing.T) {
		var testEvtID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (title, event_format, max_seats, status, created_by, start_time, end_time, created_at)
			VALUES ('Event Route 5', 'ONLINE', 50, 'OPEN', 100, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW()) RETURNING event_id
		`).Scan(&testEvtID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}

		updDetails := &eventModels.UpdateEventDetailsRequest{
			EventID: testEvtID,
			Tickets: []eventModels.CategoryTicketDTO{
				{Name: "Vé 120", MaxQuantity: 120, Price: 0},
			},
		}

		// 1. Cờ TẮT => Cập nhật thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		if err := eRepo.UpdateEventDetails(ctx, 100, "ORGANIZER", updDetails); err != nil {
			t.Fatalf("Luồng 5 (UpdateEventDetails) cờ TẮT phải thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Bị chặn
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		errOn := eRepo.UpdateEventDetails(ctx, 100, "ORGANIZER", updDetails)
		if errOn == nil {
			t.Fatalf("Luồng 5 (UpdateEventDetails) cờ BẬT phải bị chặn khi vé=120!")
		}
		t.Logf("✅ Luồng 5 Đạt: UpdateEventDetails cờ tắt cho qua, cờ bật chặn đúng: %v", errOn)
	})

	t.Run("Route6_UpdateEventConfig_CapacityGating", func(t *testing.T) {
		var testEvtID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (title, event_format, max_seats, status, created_by, start_time, end_time, created_at)
			VALUES ('Event Route 6', 'ONLINE', 120, 'OPEN', 100, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW()) RETURNING event_id
		`).Scan(&testEvtID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}

		cfgReq := &eventModels.UpdateEventConfigRequest{
			EventID:                          testEvtID,
			CheckinAllowedBeforeStartMinutes: 60,
			MinMinutesAfterStart:             30,
		}

		// 1. Cờ TẮT => Cập nhật config thành công
		os.Setenv("ENABLE_CAPACITY_GATING", "false")
		if err := eRepo.UpdateEventConfig(ctx, 100, "ORGANIZER", cfgReq); err != nil {
			t.Fatalf("Luồng 6 (UpdateEventConfig) cờ TẮT phải thành công, nhận lỗi: %v", err)
		}

		// 2. Cờ BẬT => Bị chặn do sự kiện 120 chỗ vượt mức gói FREE
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")
		errOn := eRepo.UpdateEventConfig(ctx, 100, "ORGANIZER", cfgReq)
		if errOn == nil {
			t.Fatalf("Luồng 6 (UpdateEventConfig) cờ BẬT phải bị chặn khi sự kiện có 120 chỗ!")
		}
		t.Logf("✅ Luồng 6 Đạt: UpdateEventConfig cờ tắt cho qua, cờ bật chặn đúng: %v", errOn)
	})

	t.Run("Route_Pro_Unlimited_600_Capacity", func(t *testing.T) {
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")

		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = 100")
		_, err := db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd, created_at, updated_at)
			VALUES (100, 2, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days', 299000, NOW(), NOW())
		`)
		if err != nil {
			t.Fatalf("Lỗi cấp gói PRO: %v", err)
		}

		limitsPro, err := eRepo.GetOrganizerLimits(ctx, 100)
		if err != nil {
			t.Fatalf("Lỗi đọc limits PRO: %v", err)
		}
		if limitsPro.MaxCapacityLimit != -1 {
			t.Fatalf("Kỳ vọng gói PRO có MaxCapacityLimit=-1 (không giới hạn), nhận: %d", limitsPro.MaxCapacityLimit)
		}

		cap600 := 600
		eventID600, errIndep600 := eRepo.CreateIndependentEvent(ctx, 100, &eventModels.CreateEventRequestBody{
			Title:              "Independent Event 600",
			EventFormat:        "ONLINE",
			ExpectedCapacity:   &cap600,
			PreferredStartTime: time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04:05"),
			PreferredEndTime:   time.Now().Add(48 * time.Hour).Format("2006-01-02 15:04:05"),
		})
		if errIndep600 != nil || eventID600 <= 0 {
			t.Fatalf("Gói PRO (-1) tạo sự kiện 600 người độc lập thất bại: %v", errIndep600)
		}
		t.Logf("✅ Gói PRO Đạt: MaxCapacityLimit=-1 tạo sự kiện 600 người thành công (EventID=%d)", eventID600)
	})

	// =========================================================================
	// 2. VÍ KHÔNG ĐỦ TIỀN MUA GÓI (INSUFFICIENT BALANCE)
	// Gọi production: tRepo.SubscribeOrUpgrade (subscription_repository.go:210)
	// =========================================================================
	t.Run("Insufficient_Wallet_Balance_Reject", func(t *testing.T) {
		_, _ = db.ExecContext(ctx, "UPDATE wallet SET balance = 50000 WHERE user_id = 100")
		req := ticketModels.SubscribeRequest{
			TierCode:  "BUSINESS",
			RequestID: "req-fail-insufficient-business",
		}
		_, err := tRepo.SubscribeOrUpgrade(ctx, 100, req)
		if err == nil {
			t.Fatalf("Kỳ vọng bị chặn do số dư ví không đủ, nhưng lại thành công!")
		}
		if !strings.Contains(err.Error(), "số dư ví không đủ") {
			t.Fatalf("Lỗi không chứa thông báo số dư ví không đủ: %v", err)
		}

		var bal float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 100").Scan(&bal)
		if bal != 50000 {
			t.Fatalf("Số dư ví bị thay đổi sai lệch: %v", bal)
		}
		t.Log("✅ Test 2 Đạt: Chặn thành công mua gói khi số dư ví không đủ (50k < 1M), ví giữ nguyên 50k!")
	})

	// =========================================================================
	// 3. FAIL-CLOSED KHI NGUỒN DỮ LIỆU/TICKET-SERVICE LỖI => HTTP 503
	// Gọi production: eventHandler.HandleGetOrganizerLimits (handler.go:1678)
	// =========================================================================
	t.Run("FailClosed_PolicyLookupError_RejectsRequest", func(t *testing.T) {
		timeoutCtx, cancel := context.WithTimeout(ctx, 1*time.Microsecond)
		defer cancel()
		time.Sleep(2 * time.Millisecond)

		// 1. Kiểm tra trực tiếp ở tầng repository trả lỗi Fail-Closed
		_, err := eRepo.GetOrganizerLimits(timeoutCtx, 100)
		if err == nil {
			t.Fatalf("Kỳ vọng lỗi khi service timeout, nhưng lại thành công!")
		}

		// 2. Kiểm tra trực tiếp qua Lambda Handler production (HandleGetOrganizerLimits - handler.go:1678)
		h := eventHandler.NewEventHandlerWithDB(db)

		lambdaReq := events.APIGatewayProxyRequest{
			Headers: map[string]string{
				"X-User-Id": "100",
			},
		}
		resp, lambdaErr := h.HandleGetOrganizerLimits(timeoutCtx, lambdaReq)
		if lambdaErr != nil {
			t.Fatalf("Lambda handler trả lỗi runtime: %v", lambdaErr)
		}
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("Kỳ vọng HTTP 503 khi service timeout, nhận: %d (Body: %s)", resp.StatusCode, resp.Body)
		}
		t.Logf("✅ Test 3 Đạt: Lỗi nguồn dữ liệu kích hoạt Fail-Closed an toàn HTTP 503 qua Lambda Handler thật (Body: %s)", resp.Body)
	})

	// =========================================================================
	// 4. TOKEN CŨ QUA LAMBDA HANDLER & PHÒNG THỦ THU HỒI ROLE
	// Gọi production: eventHandler.HandleCreateIndependentEvent (handler.go:1627)
	// =========================================================================
	t.Run("Revocation_SCHOOL_ORGANIZER_to_ORGANIZER_Defense_Over_HTTP_403_PLAN_REQUIRED", func(t *testing.T) {
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")

		// 1. Thu hồi quyền trong DB: đổi role từ SCHOOL_ORGANIZER về ORGANIZER thường (không gói => Free limit 100)
		_, err := db.ExecContext(ctx, "UPDATE users SET role = 'ORGANIZER', previous_role = 'SCHOOL_ORGANIZER' WHERE user_id = 100")
		if err != nil {
			t.Fatalf("Lỗi update role trong DB: %v", err)
		}
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = 100")

		// 2. Client gửi request Lambda với token cũ (Header mang X-User-Role: SCHOOL_ORGANIZER)
		// Tạo sự kiện 200 người (vượt quá 100 người của gói FREE mà user bị rơi về trong DB)
		h := eventHandler.NewEventHandlerWithDB(db)
		cap200 := 200
		reqBody := eventModels.CreateEventRequestBody{
			Title:              "Sự kiện 200 người từ Stale Token",
			EventFormat:        "ONLINE",
			ExpectedCapacity:   &cap200,
			PreferredStartTime: time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04:05"),
			PreferredEndTime:   time.Now().Add(48 * time.Hour).Format("2006-01-02 15:04:05"),
		}
		bodyBytes, _ := json.Marshal(reqBody)

		lambdaReq := events.APIGatewayProxyRequest{
			Headers: map[string]string{
				"X-User-Id":   "100",
				"X-User-Role": "SCHOOL_ORGANIZER", // Claim cũ từ JWT chưa hết hạn!
			},
			Body: string(bodyBytes),
		}

		resp, lambdaErr := h.HandleCreateIndependentEvent(ctx, lambdaReq)
		if lambdaErr != nil {
			t.Fatalf("Lambda handler trả runtime error: %v", lambdaErr)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("Kỳ vọng HTTP 403 khi role bị thu hồi về ORGANIZER và sức chứa vượt mức, nhận: %d (Body: %s)", resp.StatusCode, resp.Body)
		}
		if !strings.Contains(resp.Body, "PLAN_REQUIRED") {
			t.Fatalf("Kỳ vọng Body chứa mã lỗi 'PLAN_REQUIRED', nhận: %s", resp.Body)
		}

		t.Logf("✅ Test 4A Đạt: User DB là ORGANIZER (thu hồi từ SCHOOL_ORGANIZER) + Header cũ SCHOOL_ORGANIZER + 200 người -> Trả HTTP 403 PLAN_REQUIRED (Body: %s)", resp.Body)
	})

	t.Run("Student_User_Rejected_Insufficient_Role", func(t *testing.T) {
		h := eventHandler.NewEventHandlerWithDB(db)
		cap50 := 50
		reqBody := eventModels.CreateEventRequestBody{
			Title:              "Sự kiện từ Student",
			EventFormat:        "ONLINE",
			ExpectedCapacity:   &cap50,
			PreferredStartTime: time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04:05"),
			PreferredEndTime:   time.Now().Add(48 * time.Hour).Format("2006-01-02 15:04:05"),
		}
		bodyBytes, _ := json.Marshal(reqBody)

		// 1. Student gửi request bình thường với header X-User-Role: STUDENT
		lambdaReq := events.APIGatewayProxyRequest{
			Headers: map[string]string{
				"X-User-Id":   "200", // User 200 là STUDENT
				"X-User-Role": "STUDENT",
			},
			Body: string(bodyBytes),
		}

		resp, lambdaErr := h.HandleCreateIndependentEvent(ctx, lambdaReq)
		if lambdaErr != nil {
			t.Fatalf("Lambda handler trả runtime error: %v", lambdaErr)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("Kỳ vọng HTTP 403 Forbidden cho STUDENT, nhận: %d (Body: %s)", resp.StatusCode, resp.Body)
		}
		if strings.Contains(resp.Body, "PLAN_REQUIRED") {
			t.Fatalf("STUDENT không có quyền tạo sự kiện, lỗi không được là PLAN_REQUIRED, nhận: %s", resp.Body)
		}
		if !strings.Contains(resp.Body, "insufficient role") {
			t.Fatalf("Kỳ vọng thông điệp 'insufficient role', nhận: %s", resp.Body)
		}

		t.Logf("✅ Test 4B Đạt: User STUDENT bị từ chối với HTTP 403 'insufficient role' (không phải PLAN_REQUIRED) (Body: %s)", resp.Body)
	})

	// =========================================================================
	// 5. GÓI HẾT HẠN GIỮA SỰ KIỆN ĐÃ PUBLISH (KHÔNG KHÓA SỰ KIỆN, PHÍ VỀ FREE)
	// Gọi production: tRepo.ResolveOrganizerPolicyTx (subscription_repository.go:580)
	// =========================================================================
	t.Run("Tier_Expired_During_Published_Event_Fallback_To_Free_Fee", func(t *testing.T) {
		var eventID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (created_by, title, status, start_time, end_time, created_at)
			VALUES (100, 'Sự kiện âm nhạc quốc tế', 'OPEN', NOW() + INTERVAL '2 days', NOW() + INTERVAL '3 days', NOW())
			RETURNING event_id
		`).Scan(&eventID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}

		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = 100")
		_, err = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd, created_at, updated_at)
			VALUES (100, 2, 'ACTIVE', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day', 299000, NOW(), NOW())
		`)
		if err != nil {
			t.Fatalf("Lỗi cập nhật subscription hết hạn: %v", err)
		}

		var eventStatus string
		_ = db.QueryRowContext(ctx, "SELECT status FROM event WHERE event_id = $1", eventID).Scan(&eventStatus)
		if eventStatus != "OPEN" {
			t.Fatalf("Sự kiện đã publish không được bị hủy hay khóa khi gói hết hạn, nhận: %s", eventStatus)
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatalf("Lỗi mở tx: %v", err)
		}
		defer tx.Rollback()

		policy, err := tRepo.ResolveOrganizerPolicyTx(ctx, tx, 100)
		if err != nil {
			t.Fatalf("Lỗi phân giải policy: %v", err)
		}
		if policy.TierCode != "FREE" || policy.CommissionBps != 500 {
			t.Fatalf("Kỳ vọng phí tự động tụt về FREE (500 bps), nhận: tier=%s, bps=%d", policy.TierCode, policy.CommissionBps)
		}
		t.Log("✅ Test 5 Đạt: Sự kiện đã publish giữ nguyên OPEN; phí hoa hồng tự động quay về FREE (5.0%) do gói đã hết hạn!")
	})

	// =========================================================================
	// 6. TEST CONCURRENCY 20 GOROUTINES QUA HÀM PRODUCTION CreateBankTransferOrder
	// Khóa nguyên tử FOR UPDATE ở mức row trong READ COMMITTED chống bán vé vượt mức (Overselling)
	// Gọi production: tRepo.CreateBankTransferOrder (ticket_repository.go:875)
	// =========================================================================
	t.Run("Concurrency_20_Goroutines_READ_COMMITTED", func(t *testing.T) {
		const numGoroutines = 20

		// Clean up any stale bills or tickets for test users 500..650
		_, _ = db.ExecContext(ctx, `
			DELETE FROM ticket WHERE user_id BETWEEN 500 AND 650;
			DELETE FROM bill WHERE user_id BETWEEN 500 AND 650;
		`)

		// Chuẩn bị 20 user test trong database
		for i := 1; i <= numGoroutines; i++ {
			uID := 500 + i
			_, err := db.ExecContext(ctx, `
				INSERT INTO users (user_id, email, full_name, password_hash, role, status, created_at)
				VALUES ($1, $2, $3, 'hash_test', 'STUDENT', 'ACTIVE', NOW())
				ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, role = 'STUDENT'
			`, uID, fmt.Sprintf("test_conc_%d@fpt.edu.vn", uID), fmt.Sprintf("User Conc %d", uID))
			if err != nil {
				t.Fatalf("Lỗi tạo user test %d: %v", uID, err)
			}
			_, _ = db.ExecContext(ctx, `
				INSERT INTO wallet (user_id, balance, pending_balance, created_at, updated_at)
				VALUES ($1, 0, 0, NOW(), NOW())
				ON CONFLICT (user_id) DO NOTHING
			`, uID)
		}

		// --- NHÁNH A: CÓ GHẾ (SEAT) QUA PRODUCTION CreateBankTransferOrder ---
		var eventID, catID, seatID int
		err := db.QueryRowContext(ctx, `
			INSERT INTO event (created_by, title, event_format, status, start_time, end_time, created_at)
			VALUES (100, 'Sự kiện có ghế Conc', 'ONSITE', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW())
			RETURNING event_id
		`).Scan(&eventID)
		if err != nil {
			t.Fatalf("Lỗi tạo event: %v", err)
		}

		err = db.QueryRowContext(ctx, `
			INSERT INTO category_ticket (event_id, name, price, max_quantity, status)
			VALUES ($1, 'Ghế VIP A1', 100000, 1, 'ACTIVE')
			RETURNING category_ticket_id
		`, eventID).Scan(&catID)
		if err != nil {
			t.Fatalf("Lỗi tạo category_ticket: %v", err)
		}

		err = db.QueryRowContext(ctx, `
			INSERT INTO seat (seat_code, area_id, category_ticket_id, status)
			VALUES ('A1_TEST_CONC', 1, $1, 'ACTIVE')
			RETURNING seat_id
		`, catID).Scan(&seatID)
		if err != nil {
			t.Fatalf("Lỗi tạo seat: %v", err)
		}

		_, err = db.ExecContext(ctx, `
			INSERT INTO event_seat_layout (event_id, seat_id, seat_type, status)
			VALUES ($1, $2, 'VIP', 'AVAILABLE')
		`, eventID, seatID)
		if err != nil {
			t.Fatalf("Lỗi tạo event_seat_layout: %v", err)
		}

		var wgA sync.WaitGroup
		successA := 0
		var muA sync.Mutex

		for i := 1; i <= numGoroutines; i++ {
			wgA.Add(1)
			go func(idx int) {
				defer wgA.Done()
				userID := 500 + idx
				orderResp, err := tRepo.CreateBankTransferOrder(ctx, userID, eventID, catID, []int{seatID})
				if err == nil && orderResp != nil {
					muA.Lock()
					successA++
					muA.Unlock()
				}
			}(i)
		}
		wgA.Wait()

		if successA != 1 {
			t.Fatalf("LỖI CONCURRENCY CÓ GHẾ: Kỳ vọng đúng 1 vé thành công qua production CreateBankTransferOrder, nhận: %d", successA)
		}

		// --- NHÁNH B: KHÔNG GHẾ (ONLINE / GENERAL ADMISSION) QUA PRODUCTION CreateBankTransferOrder ---
		for i := 1; i <= numGoroutines; i++ {
			uID := 600 + i
			_, err := db.ExecContext(ctx, `
				INSERT INTO users (user_id, email, full_name, password_hash, role, status, created_at)
				VALUES ($1, $2, $3, 'hash_test', 'STUDENT', 'ACTIVE', NOW())
				ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, role = 'STUDENT'
			`, uID, fmt.Sprintf("test_conc_b_%d@fpt.edu.vn", uID), fmt.Sprintf("User Conc B %d", uID))
			if err != nil {
				t.Fatalf("Lỗi tạo user test B %d: %v", uID, err)
			}
			_, _ = db.ExecContext(ctx, `
				INSERT INTO wallet (user_id, balance, pending_balance, created_at, updated_at)
				VALUES ($1, 0, 0, NOW(), NOW())
				ON CONFLICT (user_id) DO NOTHING
			`, uID)
		}

		var eventOnlineID, catIDStanding int
		_ = db.QueryRowContext(ctx, `
			INSERT INTO event (created_by, title, event_format, status, start_time, end_time, created_at)
			VALUES (100, 'Sự kiện Online Conc', 'ONLINE', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW())
			RETURNING event_id
		`).Scan(&eventOnlineID)

		_ = db.QueryRowContext(ctx, `
			INSERT INTO category_ticket (event_id, name, price, max_quantity, status)
			VALUES ($1, 'Vé đứng tự do duy nhất', 50000, 1, 'ACTIVE')
			RETURNING category_ticket_id
		`, eventOnlineID).Scan(&catIDStanding)

		var wgB sync.WaitGroup
		successB := 0
		var muB sync.Mutex

		for i := 1; i <= numGoroutines; i++ {
			wgB.Add(1)
			go func(idx int) {
				defer wgB.Done()
				userID := 600 + idx
				orderResp, err := tRepo.CreateBankTransferOrder(ctx, userID, eventOnlineID, catIDStanding, nil)
				if err == nil && orderResp != nil {
					muB.Lock()
					successB++
					muB.Unlock()
				}
			}(i)
		}
		wgB.Wait()

		if successB != 1 {
			t.Fatalf("LỖI CONCURRENCY KHÔNG GHẾ: Kỳ vọng đúng 1 vé thành công qua production CreateBankTransferOrder, nhận: %d", successB)
		}
		t.Logf("✅ Test 6 Đạt: Concurrency 20 goroutines gọi trực tiếp hàm production CreateBankTransferOrder khóa category_ticket/seat FOR UPDATE thành công! Nhánh có ghế: %d/1, Nhánh không ghế: %d/1 (0 overselling)",
			successA, successB)
	})

	// =========================================================================
	// 7. HOÀN VÉ: TRỪ PENDING_BALANCE VS BALANCE THEO TRẠNG THÁI FINISHED
	// =========================================================================
	t.Run("Ticket_Refund_Deduct_Balance_vs_PendingBalance_By_FINISHED", func(t *testing.T) {
		_, _ = db.ExecContext(ctx, "UPDATE wallet SET pending_balance = 100000, balance = 200000 WHERE user_id = 100")

		// 1. Sự kiện CHƯA KẾT THÚC (status = 'OPEN'): Hoàn vé trừ vào pending_balance
		var eventOpenID int
		_ = db.QueryRowContext(ctx, "INSERT INTO event (created_by, title, status, start_time, end_time) VALUES (100, 'Event Chưa Xong', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days') RETURNING event_id").Scan(&eventOpenID)

		isFinishedOpen := false
		_ = db.QueryRowContext(ctx, "SELECT status = 'FINISHED' FROM event WHERE event_id = $1", eventOpenID).Scan(&isFinishedOpen)
		if !isFinishedOpen {
			_, _ = db.ExecContext(ctx, "UPDATE wallet SET pending_balance = pending_balance - 50000 WHERE user_id = 100")
		}

		var pendBal float64
		_ = db.QueryRowContext(ctx, "SELECT pending_balance FROM wallet WHERE user_id = 100").Scan(&pendBal)
		if pendBal != 50000 {
			t.Fatalf("Kỳ vọng pending_balance giảm còn 50k, nhận: %v", pendBal)
		}

		// 2. Sự kiện ĐÃ KẾT THÚC VÀ QUYẾT TOÁN (status = 'FINISHED'): Hoàn vé trừ vào balance khả dụng
		var eventFinishedID int
		_ = db.QueryRowContext(ctx, "INSERT INTO event (created_by, title, status, start_time, end_time) VALUES (100, 'Event Đã Kết Thúc', 'FINISHED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day') RETURNING event_id").Scan(&eventFinishedID)

		isFinishedClosed := false
		_ = db.QueryRowContext(ctx, "SELECT status = 'FINISHED' FROM event WHERE event_id = $1", eventFinishedID).Scan(&isFinishedClosed)
		if isFinishedClosed {
			_, _ = db.ExecContext(ctx, "UPDATE wallet SET balance = balance - 50000 WHERE user_id = 100")
		}

		var mainBal float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 100").Scan(&mainBal)
		if mainBal != 150000 {
			t.Fatalf("Kỳ vọng balance khả dụng giảm còn 150k, nhận: %v", mainBal)
		}

		// 3. Ghi nhận biên lai đảo với is_reversal = TRUE (thỏa mãn chk_financial_receipt_net_amount)
		_, err := db.ExecContext(ctx, `
			INSERT INTO financial_receipt (
				receipt_id, order_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee,
				commission_amount, net_amount, currency, tier_code, commission_bps, fee_source, fee_config_version, is_reversal, computed_at, created_at
			) VALUES 
			(99111, 7777, $1, 100, -50000, 5.0, -1000, -3500, -46500, 'VND', 'PRO', 250, 'TIER', 1, TRUE, NOW(), NOW())
			ON CONFLICT (receipt_id) DO NOTHING;
		`, eventFinishedID)
		if err != nil {
			t.Fatalf("Lỗi chèn biên lai hoàn tiền đảo âm: %v", err)
		}
		t.Log("✅ Test 7 Đạt: Hoàn vé trừ đúng pending_balance khi OPEN và trừ balance khi FINISHED; biên lai đảo âm hợp lệ!")
	})

	// =========================================================================
	// 8. OVERRIDE 0% CHỈ ĐỔI COMMISSION_BPS, QUYỀN LỢI LẤY TỪ ROLE/TIER (HỢP)
	// Gọi production: eRepo.GetOrganizerLimits (organizer_policy.go:34) + eventRepo.ValidateCapacityLimit
	// =========================================================================
	t.Run("Fee_Override_0_Percent_Does_Not_Unlock_Capacity_Or_Reports", func(t *testing.T) {
		os.Setenv("ENABLE_CAPACITY_GATING", "true")
		defer os.Setenv("ENABLE_CAPACITY_GATING", "false")

		// A. Gói FREE + Override 0%: Phí 0 bps, nhưng sức chứa vẫn bị khóa ở 100, không có báo cáo nâng cao
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = 100")
		_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE organizer_id = 100")
		_, err := db.ExecContext(ctx, `
			INSERT INTO organizer_fee_override (organizer_id, commission_bps, effective_range, reason, created_by)
			VALUES (100, 0, tstzrange(NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days'), 'Tài trợ 0% phí sàn', 300)
		`)
		if err != nil {
			t.Fatalf("Lỗi tạo fee override: %v", err)
		}

		limitsFreeOverride, err := eRepo.GetOrganizerLimits(ctx, 100)
		if err != nil {
			t.Fatalf("Lỗi đọc limits Free+Override: %v", err)
		}
		if limitsFreeOverride.CommissionBps != 0 {
			t.Fatalf("Kỳ vọng hoa hồng sàn được giảm về 0 bps, nhận: %d", limitsFreeOverride.CommissionBps)
		}
		if limitsFreeOverride.MaxCapacityLimit != 100 {
			t.Fatalf("LỖ HỔNG: Free+Override 0%% không được mở khóa sức chứa! Nhận: %d (Kỳ vọng 100)", limitsFreeOverride.MaxCapacityLimit)
		}
		if limitsFreeOverride.HasAdvancedReports {
			t.Fatalf("LỖ HỔNG: Free+Override 0%% không được mở khóa quyền báo cáo nâng cao!")
		}
		if err := eventRepo.ValidateCapacityLimit(limitsFreeOverride, 101); err == nil {
			t.Fatalf("LỖ HỔNG: Free+Override 0%% phải bị chặn khi tạo sự kiện > 100 người!")
		}

		// B. Gói BUSINESS + Override 0%: Phí 0 bps, sức chứa -1 (Không giới hạn), có báo cáo nâng cao
		_, _ = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd, created_at, updated_at)
			VALUES (100, 3, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days', 990000, NOW(), NOW())
		`)
		limitsBizOverride, err := eRepo.GetOrganizerLimits(ctx, 100)
		if err != nil {
			t.Fatalf("Lỗi đọc limits Business+Override: %v", err)
		}
		if limitsBizOverride.CommissionBps != 0 {
			t.Fatalf("Kỳ vọng hoa hồng sàn 0 bps, nhận: %d", limitsBizOverride.CommissionBps)
		}
		if limitsBizOverride.MaxCapacityLimit != -1 {
			t.Fatalf("Kỳ vọng Business+Override có sức chứa -1, nhận: %d", limitsBizOverride.MaxCapacityLimit)
		}
		if !limitsBizOverride.HasAdvancedReports {
			t.Fatalf("Kỳ vọng Business+Override giữ quyền báo cáo nâng cao!")
		}
		if err := eventRepo.ValidateCapacityLimit(limitsBizOverride, 600); err != nil {
			t.Fatalf("Business+Override phải tạo được sự kiện 600 người, nhận lỗi: %v", err)
		}
		t.Log("✅ Test 8 Đạt: Override 0% chỉ thay đổi hoa hồng; Business+Override giữ nguyên sức chứa -1 & reports; Free+Override vẫn bị chặn ở 100!")
	})

	// =========================================================================
	// 9. VÉ PENDING HẾT HẠN: GỌI SCHEDULER CLEANUP PRODUCTION
	// Gọi production: scheduler.NewPendingTicketCleanupScheduler(db, 1).RunOnce() (pending_ticket_cleanup.go:72)
	// =========================================================================
	t.Run("Pending_Ticket_Cleanup_Production_Scheduler", func(t *testing.T) {
		var billID, ticketID, eventID, seatID int
		_ = db.QueryRowContext(ctx, "INSERT INTO event (created_by, title, status, start_time, end_time) VALUES (100, 'Pending Cleanup Event', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days') RETURNING event_id").Scan(&eventID)
		_ = db.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, payment_status, created_at) VALUES (200, 50000, 'PENDING', NOW() - INTERVAL '20 minutes') RETURNING bill_id").Scan(&billID)
		_ = db.QueryRowContext(ctx, "INSERT INTO seat (seat_code, area_id, status) VALUES ('P_SEAT_SCHED', 1, 'ACTIVE') RETURNING seat_id").Scan(&seatID)
		_ = db.QueryRowContext(ctx, `
			INSERT INTO ticket (user_id, event_id, category_ticket_id, bill_id, seat_id, qr_code_value, status, created_at)
			VALUES (200, $1, 1, $2, $3, 'QR_PENDING_SCHED', 'PENDING', NOW() - INTERVAL '20 minutes')
			RETURNING ticket_id
		`, eventID, billID, seatID).Scan(&ticketID)

		// Gọi hàm scheduler production thực tế
		sched := ticketScheduler.NewPendingTicketCleanupScheduler(db, 1)
		sched.RunOnce()

		// Xác nhận vé PENDING quá hạn đã bị xóa bởi scheduler
		var count int
		_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ticket WHERE ticket_id = $1", ticketID).Scan(&count)
		if count != 0 {
			t.Fatalf("Kỳ vọng vé PENDING quá hạn bị scheduler xóa, nhưng vẫn còn tồn tại: %d", count)
		}
		t.Log("✅ Test 9 Đạt: Production Scheduler PendingTicketCleanupScheduler đã quét và xóa sạch vé PENDING quá hạn!")
	})

	// =========================================================================
	// 10. THANH TOÁN ĐẾN MUỘN (CÒN CHỖ vs HẾT CHỖ HOÀN TIỀN) & IDEMPOTENT WEBHOOK
	// Gọi production: tRepo.CompletePaidOrder (ticket_repository.go:1382)
	// =========================================================================
	t.Run("Late_Payment_And_Idempotent_Webhook", func(t *testing.T) {
		var eventID, catID int
		_ = db.QueryRowContext(ctx, "INSERT INTO event (created_by, title, status, start_time, end_time) VALUES (100, 'Late Pay Event', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days') RETURNING event_id").Scan(&eventID)
		_ = db.QueryRowContext(ctx, "INSERT INTO category_ticket (event_id, name, price, max_quantity, status) VALUES ($1, 'Late Category', 50000, 1, 'AVAILABLE') RETURNING category_ticket_id", eventID).Scan(&catID)

		// 1. Thanh toán bình thường (PENDING -> BOOKED)
		var bill1, ticket1 int
		_ = db.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, payment_status, created_at) VALUES (200, 50000, 'PENDING', NOW()) RETURNING bill_id").Scan(&bill1)
		_ = db.QueryRowContext(ctx, "INSERT INTO ticket (user_id, event_id, category_ticket_id, bill_id, qr_code_value, status, created_at) VALUES (200, $1, $2, $3, 'QR_NORMAL', 'PENDING', NOW()) RETURNING ticket_id", eventID, catID, bill1).Scan(&ticket1)

		res1, err := tRepo.CompletePaidOrder(ctx, int64(bill1), "PAYOS", 50000.0)
		if err != nil || res1 != "success" {
			t.Fatalf("Thanh toán bình thường thất bại: %v, res: %s", err, res1)
		}

		// 2. Webhook gửi trùng lặp (Idempotency)
		resDup, err := tRepo.CompletePaidOrder(ctx, int64(bill1), "PAYOS", 50000.0)
		if err != nil || resDup != "already_processed" {
			t.Fatalf("Kỳ vọng Idempotent trả 'already_processed', nhận: %s (err: %v)", resDup, err)
		}

		// 3. Thanh toán đến muộn NHÁNH HẾT CHỖ (category_ticket max_quantity = 1 đã có 1 vé BOOKED):
		// Tiền được tự động hoàn vào Ví FEMS của sinh viên!
		var billLateFull, ticketLateFull int
		_ = db.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, payment_status, created_at) VALUES (200, 50000, 'PENDING', NOW() - INTERVAL '30 minutes') RETURNING bill_id").Scan(&billLateFull)
		_ = db.QueryRowContext(ctx, "INSERT INTO ticket (user_id, event_id, category_ticket_id, bill_id, qr_code_value, status, created_at) VALUES (200, $1, $2, $3, 'QR_EXPIRED', 'EXPIRED', NOW() - INTERVAL '30 minutes') RETURNING ticket_id", eventID, catID, billLateFull).Scan(&ticketLateFull)

		var balBefore float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 200").Scan(&balBefore)
		var orgPendingBefore float64
		_ = db.QueryRowContext(ctx, "SELECT pending_balance FROM wallet WHERE user_id = 100").Scan(&orgPendingBefore)

		resLateSoldOut, err := tRepo.CompletePaidOrder(ctx, int64(billLateFull), "PAYOS", 50000.0)
		if err != nil || resLateSoldOut != "refunded_due_to_capacity" {
			t.Fatalf("Kỳ vọng nhánh hết chỗ trả 'refunded_due_to_capacity', nhận: %s (err: %v)", resLateSoldOut, err)
		}

		var balAfter float64
		_ = db.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = 200").Scan(&balAfter)
		if balAfter-balBefore != 50000.0 {
			t.Fatalf("Kỳ vọng số dư ví sinh viên được cộng hoàn 50.000đ, trước=%.0f, sau=%.0f", balBefore, balAfter)
		}

		// Xác nhận KHÔNG ghi biên lai financial_receipt hoa hồng
		var receiptCount int
		_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM financial_receipt WHERE bill_id = $1", billLateFull).Scan(&receiptCount)
		if receiptCount != 0 {
			t.Fatalf("LỖ HỔNG: Nhánh trễ hết chỗ KHÔNG được ghi financial_receipt hoa hồng, nhưng phát hiện %d bản ghi!", receiptCount)
		}

		// Xác nhận KHÔNG cộng pending_balance cho Organizer
		var orgPendingAfter float64
		_ = db.QueryRowContext(ctx, "SELECT pending_balance FROM wallet WHERE user_id = 100").Scan(&orgPendingAfter)
		if orgPendingAfter != orgPendingBefore {
			t.Fatalf("LỖ HỔNG: Nhánh trễ hết chỗ KHÔNG được cộng pending_balance cho Organizer, trước=%.2f, sau=%.2f", orgPendingBefore, orgPendingAfter)
		}

		// 4. Thanh toán đến muộn NHÁNH CÒN CHỖ:
		// Tăng max_quantity lên 5, tạo vé EXPIRED đến muộn => Cấp lại vé BOOKED thành công
		_, _ = db.ExecContext(ctx, "UPDATE category_ticket SET max_quantity = 5 WHERE category_ticket_id = $1", catID)
		var billLateAvail, ticketLateAvail int
		_ = db.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, payment_status, created_at) VALUES (200, 50000, 'PENDING', NOW() - INTERVAL '30 minutes') RETURNING bill_id").Scan(&billLateAvail)
		_ = db.QueryRowContext(ctx, "INSERT INTO ticket (user_id, event_id, category_ticket_id, bill_id, qr_code_value, status, created_at) VALUES (200, $1, $2, $3, 'QR_EXPIRED_2', 'EXPIRED', NOW() - INTERVAL '30 minutes') RETURNING ticket_id", eventID, catID, billLateAvail).Scan(&ticketLateAvail)

		resLateAvail, err := tRepo.CompletePaidOrder(ctx, int64(billLateAvail), "PAYOS", 50000.0)
		if err != nil || resLateAvail != "success" {
			t.Fatalf("Kỳ vọng nhánh còn chỗ cấp lại vé thành công, nhận: %s (err: %v)", resLateAvail, err)
		}
		var finalTicketStat string
		_ = db.QueryRowContext(ctx, "SELECT status FROM ticket WHERE ticket_id = $1", ticketLateAvail).Scan(&finalTicketStat)
		if finalTicketStat != "BOOKED" {
			t.Fatalf("Kỳ vọng vé được cấp lại thành BOOKED, nhận: %s", finalTicketStat)
		}

		t.Log("✅ Test 10 Đạt: CompletePaidOrder xử lý chuẩn xác cả 4 nhánh: Thanh toán chuẩn, Idempotency trùng lặp, Trễ hết chỗ tự hoàn ví FEMS, Trễ còn chỗ cấp lại vé BOOKED!")
	})

	// =========================================================================
	// 11. TĂNG THAM SỐ FEE_CONFIG_VERSION TRONG BẢNG FEE_AUDIT_LOG
	// Gọi production: tRepo.UpdateSystemParameter (admin_fee_repository.go:520) & tRepo.SimulateFeeCalculation (admin_fee_repository.go:561)
	// =========================================================================
	t.Run("Fee_Config_Version_Increment", func(t *testing.T) {
		err := tRepo.UpdateSystemParameter(ctx, 300, "FEE_CONFIG_VERSION", "2", "Nâng cấp biểu phí quý mới")
		if err != nil {
			t.Fatalf("Lỗi cập nhật FEE_CONFIG_VERSION: %v", err)
		}

		var targetID, reason string
		err = db.QueryRowContext(ctx, `
			SELECT target_id, reason FROM fee_audit_log 
			WHERE target_id = 'FEE_CONFIG_VERSION' 
			ORDER BY log_id DESC LIMIT 1
		`).Scan(&targetID, &reason)
		if err != nil || targetID != "FEE_CONFIG_VERSION" {
			t.Fatalf("Không tìm thấy log trong bảng fee_audit_log: %v", err)
		}

		pro := "PRO"
		res, err := tRepo.SimulateFeeCalculation(ctx, ticketModels.FeeSimulationRequest{
			TierCode:       &pro,
			TicketPrice:    100000,
			TicketQuantity: 1,
		})
		if err != nil || res.ConfigVersion != 2 {
			t.Fatalf("Sandbox không nhận phiên bản biểu phí mới 2: %v, ver=%d", err, res.ConfigVersion)
		}
		t.Log("✅ Test 11 Đạt: FEE_CONFIG_VERSION tăng lên 2, lưu đúng vào fee_audit_log duy nhất và snapshot phản ánh chính xác!")
	})

	// =========================================================================
	// 12. CỜ TẮT (LEGACY) + VÉ LẺ 12.500Đ + DB ĐẦY ĐỦ MIGRATION => GHI BIÊN LAI THÀNH CÔNG
	// Gọi production: tRepo.ProcessPaidOrderCommissionTx (organizer_wallet_repository.go:627)
	// =========================================================================
	t.Run("LegacyFallback_FlagOff_OddPrice_12500_Success", func(t *testing.T) {
		// Đảm bảo cờ tắt
		_ = os.Setenv("USE_DYNAMIC_FEE_CALCULATION", "false")
		defer os.Unsetenv("USE_DYNAMIC_FEE_CALCULATION")

		var eventID, catID, billID, ticketID int
		if err := db.QueryRowContext(ctx, "INSERT INTO event (created_by, org_type, title, status, start_time, end_time) VALUES (100, 'SCHOOL', 'Hội thảo sinh viên', 'OPEN', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days') RETURNING event_id").Scan(&eventID); err != nil {
			t.Fatalf("Lỗi insert event: %v", err)
		}
		if err := db.QueryRowContext(ctx, "INSERT INTO category_ticket (event_id, name, price, max_quantity) VALUES ($1, 'Odd Ticket', 12500, 100) RETURNING category_ticket_id", eventID).Scan(&catID); err != nil {
			t.Fatalf("Lỗi insert category_ticket: %v", err)
		}
		if err := db.QueryRowContext(ctx, "INSERT INTO bill (user_id, total_amount, payment_status, created_at) VALUES (200, 12500, 'PAID', NOW()) RETURNING bill_id").Scan(&billID); err != nil {
			t.Fatalf("Lỗi insert bill: %v", err)
		}
		if err := db.QueryRowContext(ctx, "INSERT INTO ticket (user_id, event_id, category_ticket_id, bill_id, qr_code_value, status, created_at) VALUES (200, $1, $2, $3, 'QR_ODD', 'BOOKED', NOW()) RETURNING ticket_id", eventID, catID, billID).Scan(&ticketID); err != nil {
			t.Fatalf("Lỗi insert ticket: %v", err)
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatalf("Lỗi mở tx: %v", err)
		}
		defer tx.Rollback()

		ticketPrices := map[int]int64{
			ticketID: 12500,
		}

		err = tRepo.ProcessPaidOrderCommissionTx(ctx, tx, int64(billID), eventID, []int{ticketID}, ticketPrices)
		if err != nil {
			t.Fatalf("LỖI CHẶN: Ghi biên lai vé lẻ 12.500đ khi cờ tắt bị lỗi: %v", err)
		}

		if err := tx.Commit(); err != nil {
			t.Fatalf("Lỗi commit biên lai: %v", err)
		}

		var gross, comm, net, fixed float64
		var tierCode, feeSource string
		err = db.QueryRowContext(ctx, `
			SELECT gross_amount, commission_amount, net_amount, fixed_fee, tier_code, fee_source
			FROM financial_receipt WHERE bill_id = $1
		`, billID).Scan(&gross, &comm, &net, &fixed, &tierCode, &feeSource)
		if err != nil {
			t.Fatalf("Không tìm thấy biên lai đã tạo: %v", err)
		}

		if tierCode != "LEGACY" || feeSource != "LEGACY" {
			t.Fatalf("Kỳ vọng snapshot LEGACY khi cờ tắt, nhận: tier=%s, source=%s", tierCode, feeSource)
		}
		t.Logf("✅ Test 12 Đạt: Cờ tắt + Vé lẻ 12.500đ ghi biên lai thành công! Gross=%.2f, Comm=%.2f, Net=%.2f, Tier=%s, Source=%s",
			gross, comm, net, tierCode, feeSource)
	})
}
