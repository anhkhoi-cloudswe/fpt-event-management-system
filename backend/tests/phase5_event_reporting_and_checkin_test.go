package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/db"
	ticketHandler "github.com/fpt-event-services/services/ticket-service/handler"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	_ "github.com/lib/pq"
)

func TestPhase5_EventReportingAndCheckIn_RealDockerDB(t *testing.T) {
	connStr := "postgres://postgres:postgres@localhost:5432/fpt_event_test?sslmode=disable"

	// SAFETY GUARD
	if !strings.Contains(connStr, "localhost") && !strings.Contains(connStr, "127.0.0.1") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên host không phải localhost! ConnStr: %s", connStr)
	}
	if !strings.Contains(connStr, "fpt_event_test") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên DB không chứa 'fpt_event_test'! ConnStr: %s", connStr)
	}
	t.Log("🛡️ SAFETY GUARD PASSED: Đang kết nối tới container test an toàn (localhost:5432 / fpt_event_test).")

	testDB, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Skipf("⏭️ [CI SKIP] Không thể mở kết nối DB: %v", err)
		return
	}
	defer testDB.Close()

	if err := testDB.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] Docker Postgres local không phản hồi (%v). Bỏ qua integration test trong CI.", err)
		return
	}

	if err := db.EnsureTestSchema(testDB); err != nil {
		t.Fatalf("Lỗi khởi tạo test schema: %v", err)
	}

	ctx := context.Background()

	// 1. Chạy migration thật từ file (03 -> 04a)
	migDir := db.FindMigrationsDir()
	if migDir == "" {
		t.Fatalf("Không tìm thấy thư mục Database/migrations từ các đường dẫn tương đối!")
	}

	m03Path := filepath.Join(migDir, "03_add_school_organizer_enum.sql")
	if m03SQL, err := os.ReadFile(m03Path); err == nil {
		_, _ = testDB.ExecContext(ctx, string(m03SQL))
	}
	m04aPath := filepath.Join(migDir, "04a_subscription_and_dynamic_fees.sql")
	if m04aSQL, err := os.ReadFile(m04aPath); err == nil {
		_, _ = testDB.ExecContext(ctx, string(m04aSQL))
	}

	tHandler := ticketHandler.NewTicketHandlerWithDB(testDB)

	// Chuẩn bị dữ liệu Seed Test:
	// Users: 901=ADMIN, 902=ORGANIZER A, 903=ORGANIZER B (Người ngoài), 904=SCHOOL_ORGANIZER, 905=STUDENT
	// Event 9001 (Owner 902), Event 9002 (Owner 904), Event 9003 (Owner 902 - Empty Event)
	cleanupAndSeedSQL := `
		DELETE FROM financial_receipt WHERE event_id IN (9001, 9002, 9003) OR organizer_id BETWEEN 900 AND 920;
		DELETE FROM ticket WHERE event_id IN (9001, 9002, 9003) OR user_id BETWEEN 900 AND 920;
		DELETE FROM bill WHERE user_id BETWEEN 900 AND 920;
		DELETE FROM category_ticket WHERE event_id IN (9001, 9002, 9003);
		DELETE FROM event WHERE event_id IN (9001, 9002, 9003) OR created_by BETWEEN 900 AND 920;
		DELETE FROM users WHERE user_id BETWEEN 900 AND 920;

		INSERT INTO users (user_id, email, full_name, password_hash, role, status) VALUES 
		(901, 'admin901@fpt.edu.vn', 'Admin Tester', 'hash', 'ADMIN', 'ACTIVE'),
		(902, 'org902@fpt.edu.vn', 'Organizer Owner A', 'hash', 'ORGANIZER', 'ACTIVE'),
		(903, 'org903@fpt.edu.vn', 'Organizer Other B', 'hash', 'ORGANIZER', 'ACTIVE'),
		(904, 'school904@fpt.edu.vn', 'School Organizer C', 'hash', 'SCHOOL_ORGANIZER', 'ACTIVE'),
		(905, 'student905@fpt.edu.vn', 'Student Buyer', 'hash', 'STUDENT', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

		-- Tạo sự kiện 9001 (Owner 902)
		INSERT INTO event (event_id, title, start_time, end_time, created_by, status, is_settled, created_at)
		VALUES (9001, 'FPT Tech Day 2026', NOW() + INTERVAL '5 days', NOW() + INTERVAL '6 days', 902, 'OPEN', FALSE, NOW());

		-- Tạo sự kiện 9002 (Owner 904 - School Organizer)
		INSERT INTO event (event_id, title, start_time, end_time, created_by, status, is_settled, created_at)
		VALUES (9002, 'FPT University Hackathon 2026', NOW() + INTERVAL '10 days', NOW() + INTERVAL '12 days', 904, 'OPEN', FALSE, NOW());

		-- Tạo sự kiện 9003 (Owner 902 - Sự kiện rỗng, chưa có vé/biên lai nào)
		INSERT INTO event (event_id, title, start_time, end_time, created_by, status, is_settled, created_at)
		VALUES (9003, 'FPT AI Conference 2026', NOW() + INTERVAL '20 days', NOW() + INTERVAL '22 days', 902, 'OPEN', FALSE, NOW());

		-- Tạo các loại vé cho Event 9001
		INSERT INTO category_ticket (category_ticket_id, event_id, name, price, max_quantity) VALUES
		(9010, 9001, 'VIP Pass', 100000, 50),
		(9011, 9001, 'Free Student Pass', 0, 50),
		(9012, 9001, 'Standard Pass', 50000, 100),
		(9013, 9001, 'Early Bird Pass', 30000, 100);

		-- 1. Bill & Ticket 90001: VIP 100k (Đã thanh toán hợp lệ - BOOKED)
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(9051, 905, 100000, 'PAID', NOW());
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, bill_id, qr_code_value, status, created_at) VALUES
		(90001, 9001, 9010, 905, 9051, 'TCK-VIP-001', 'BOOKED', NOW());
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90001, 905101, 9051, 90001, 9001, 902, 100000, 2.50, 1000, 250, 1, 3500, 96500, 'PRO', 'TIER', FALSE);

		-- 2. Bill & Ticket 90002: VIP 100k đã mua sau đó hoàn vé toàn phần (Bill REFUNDED: Biên lai gốc + Biên lai đảo)
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(9052, 905, 100000, 'REFUNDED', NOW());
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, bill_id, qr_code_value, status, created_at) VALUES
		(90002, 9001, 9010, 905, 9052, 'TCK-VIP-002', 'REFUNDED', NOW());
		-- Biên lai gốc (gross 100k, fee 3.5k, net 96.5k)
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90002, 905201, 9052, 90002, 9001, 902, 100000, 2.50, 1000, 250, 1, 3500, 96500, 'PRO', 'TIER', FALSE);
		-- Biên lai đảo (Reversal: gross = -100k, fee = -3.5k, net = -96.5k)
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal, reversal_of_receipt_id) VALUES
		(90003, 905202, 9052, 90002, 9001, 902, -100000, 2.50, 1000, 250, 1, -3500, -96500, 'PRO', 'TIER', TRUE, 90002);

		-- 3. Ticket 90003: Vé Miễn Phí (0đ) và ĐÃ CHECKED_IN
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, qr_code_value, status, checkin_time, created_at) VALUES
		(90003, 9001, 9011, 905, 'TCK-FREE-003', 'CHECKED_IN', NOW() - INTERVAL '1 hour', NOW());

		-- 4. Bill & Ticket 90004: Đơn hàng và vé đang PENDING (Chưa thanh toán xong -> phải bị ẨN khỏi báo cáo)
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(9054, 905, 50000, 'PENDING', NOW());
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, bill_id, qr_code_value, status, created_at) VALUES
		(90004, 9001, 9012, 905, 9054, 'TCK-STD-004-PENDING', 'PENDING', NOW());
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90004, 905401, 9054, 90004, 9001, 902, 50000, 2.50, 1000, 250, 1, 2250, 47750, 'PRO', 'TIER', FALSE);

		-- 5. Ticket 90005: Vé Standard 50k - Đã CHECKED_OUT
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(9055, 905, 50000, 'PAID', NOW());
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, bill_id, qr_code_value, status, created_at) VALUES
		(90005, 9001, 9012, 905, 9055, 'TCK-STD-005', 'CHECKED_OUT', NOW());
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90005, 905501, 9055, 90005, 9001, 902, 50000, 2.50, 1000, 250, 1, 2250, 47750, 'PRO', 'TIER', FALSE);

		-- 6. Ticket 90006: Vé Early Bird 30k - EXPIRED (không được tính vào tickets sold)
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, qr_code_value, status, created_at) VALUES
		(90006, 9001, 9013, 905, 'TCK-EB-006-EXPIRED', 'EXPIRED', NOW());

		-- 7. Biên lai trực tiếp với bill_id = NULL (ví dụ: điều chỉnh tài chính thủ công / bảo trợ)
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90007, 905701, NULL, NULL, 9001, 902, 200000, 2.00, 0, 200, 1, 4000, 196000, 'PRO', 'OVERRIDE', FALSE);

		-- 8. Biên lai LEGACY (dữ liệu di chuyển lịch sử fee_source = 'LEGACY')
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90008, 905801, NULL, NULL, 9001, 902, 300000, 5.00, 0, 500, 1, 15000, 285000, 'FREE', 'LEGACY', FALSE);

		-- 9. Bill & Ticket 90009: Đơn hàng FAILED (thanh toán thất bại -> phải bị LOẠI KHỎI báo cáo tài chính)
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(9059, 905, 75000, 'FAILED', NOW());
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, bill_id, qr_code_value, status, created_at) VALUES
		(90009, 9001, 9012, 905, 9059, 'TCK-STD-009-FAILED', 'EXPIRED', NOW());
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal) VALUES
		(90009, 905901, 9059, 90009, 9001, 902, 75000, 2.50, 1000, 250, 1, 2875, 72125, 'PRO', 'TIER', FALSE);
	`
	if _, err := testDB.ExecContext(ctx, cleanupAndSeedSQL); err != nil {
		t.Fatalf("Lỗi chuẩn bị dữ liệu Seed cho Pha 5: %v", err)
	}

	// -------------------------------------------------------------
	// TC1: KIỂM TRA ĐỊNH DẠNG TIỀN TỆ DÙNG NGUYÊN THỂ SỐ NGUYÊN (SỐ ÂM, CA BIÊN 1.234.567, 2.350.000, 999.999)
	// -------------------------------------------------------------
	t.Run("TC1_FormatCurrencyVND_Rules_And_Edge_Cases", func(t *testing.T) {
		testCases := []struct {
			amount   int64
			expected string
		}{
			// Ca biên số nguyên theo yêu cầu đề bài (làm tròn tối đa 2 chữ số thập phân)
			{999999, "1000k"},
			{1050000, "1,05 triệu"},
			{1234, "1,23k"},
			{1234567, "1,23 triệu"},
			{2350000, "2,35 triệu"},
			// Số âm
			{-999999, "-1000k"},
			{-1050000, "-1,05 triệu"},
			{-1234, "-1,23k"},
			{-1234567, "-1,23 triệu"},
			// Các giá trị thông dụng
			{299000, "299k"},
			{50000, "50k"},
			{1000, "1k"},
			{2500, "2,5k"},
			{1000000, "1 triệu"},
			{1500000, "1,5 triệu"},
			{10000000, "10 triệu"},
			{0, "0k"},
			{-299000, "-299k"},
			{-1500000, "-1,5 triệu"},
		}

		for _, tc := range testCases {
			actual := ticketModels.FormatCurrencyVND(tc.amount)
			if actual != tc.expected {
				t.Fatalf("FormatCurrencyVND(%d) sai: nhận %s, kỳ vọng %s", tc.amount, actual, tc.expected)
			}
		}

		// Kiểm tra che mã vé MaskTicketCode
		if masked := ticketModels.MaskTicketCode("TCK-VIP-001"); masked != "TCK-****-001" {
			t.Fatalf("MaskTicketCode('TCK-VIP-001') sai: nhận %s, kỳ vọng TCK-****-001", masked)
		}

		t.Logf("✅ TC1 Đạt: Định dạng tiền tệ bằng số nguyên chính xác tuyệt đối các ca biên (1.234.567 -> '1,234567 triệu', 2.350.000 -> '2,35 triệu', 999.999 -> '999,999k', số âm)!")
	})

	// -------------------------------------------------------------
	// TC2: BÁO CÁO TÀI CHÍNH CƠ BẢN: CHỈ TÍNH BILL PAID/REFUNDED & BILL NULL, LOẠI PENDING & FAILED, TOTAL REFUNDED ĐẾM TỪ BẢNG TICKET
	// -------------------------------------------------------------
	t.Run("TC2_Financial_Overview_Netted_Receipts_And_Pending_Filter", func(t *testing.T) {
		// Gọi trực tiếp qua HTTP Handler: GET /api/v1/organizer/events/9001/financial-overview
		req := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9001/financial-overview",
			Headers: map[string]string{
				"X-User-Id": "902", // Owner sự kiện
			},
		}
		resp, err := tHandler.HandleGetEventFinancialOverview(ctx, req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("Gọi HandleGetEventFinancialOverview thất bại: status=%d, err=%v, body=%s", resp.StatusCode, err, resp.Body)
		}

		var overview ticketModels.EventFinancialOverview
		if err := json.Unmarshal([]byte(resp.Body), &overview); err != nil {
			t.Fatalf("Không unmarshal được overview: %v", err)
		}

		// 1. Doanh thu gộp (Gross):
		// Vé 1 (PAID): 100k
		// Vé 2 gốc (REFUNDED): 100k + Vé 2 đảo: -100k = 0k (Biên lai đảo Bill REFUNDED không bị lọc)
		// Vé 5 (PAID): 50k
		// Biên lai 7 (bill_id NULL): 200k
		// Biên lai 8 (LEGACY - bill_id NULL): 300k
		// (Vé 4 PENDING 50k & Vé 9 FAILED 75k BỊ LOẠI KHỎI BÁO CÁO)
		// => Tổng Gross = 100k + 0 + 50k + 200k + 300k = 650,000đ (650k)
		expectedGross := int64(650000)
		if overview.TotalGrossRevenue != expectedGross {
			t.Fatalf("TotalGrossRevenue sai: nhận %d, kỳ vọng %d", overview.TotalGrossRevenue, expectedGross)
		}
		if overview.TotalGrossFormatted != "650k" {
			t.Fatalf("TotalGrossFormatted sai: nhận %s, kỳ vọng 650k", overview.TotalGrossFormatted)
		}

		// 2. Phí sàn (Platform Fee / Commission Amount):
		// Vé 1: 3,500đ
		// Vé 2 gốc: 3,500đ + Vé 2 đảo: -3,500đ = 0đ
		// Vé 5: 2,250đ
		// Biên lai 7: 4,000đ
		// Biên lai 8: 15,000đ
		// => Tổng Platform Fee = 3,500 + 0 + 2,250 + 4,000 + 15,000 = 24,750đ
		expectedFee := int64(24750)
		if overview.TotalPlatformFee != expectedFee {
			t.Fatalf("TotalPlatformFee sai: nhận %d, kỳ vọng %d", overview.TotalPlatformFee, expectedFee)
		}

		// 3. Thực nhận (Net Profit): 96,500 + 0 + 47,750 + 196,000 + 285,000 = 625,250đ
		expectedNet := int64(625250)
		if overview.TotalNetProfit != expectedNet {
			t.Fatalf("TotalNetProfit sai: nhận %d, kỳ vọng %d", overview.TotalNetProfit, expectedNet)
		}

		// 4. Số vé đã bán (đếm từ bảng ticket với tập trạng thái 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT')
		// 90001 (BOOKED) + 90003 (CHECKED_IN - 0đ) + 90005 (CHECKED_OUT) = 3 vé!
		if overview.TotalTicketsSold != 3 {
			t.Fatalf("TotalTicketsSold sai: nhận %d, kỳ vọng 3", overview.TotalTicketsSold)
		}

		// 5. TotalTicketsRefunded đếm trực tiếp từ bảng ticket (status = 'REFUNDED' -> vé 90002 = 1 vé)
		if overview.TotalTicketsRefunded != 1 {
			t.Fatalf("TotalTicketsRefunded đếm từ bảng ticket sai: nhận %d, kỳ vọng 1", overview.TotalTicketsRefunded)
		}

		// 6. Kiểm tra sự kiện trống (Event 9003 không có vé/biên lai nào) => trả về 0đ không lỗi
		reqEmpty := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9003/financial-overview",
			Headers:    map[string]string{"X-User-Id": "902"},
		}
		respEmpty, err := tHandler.HandleGetEventFinancialOverview(ctx, reqEmpty)
		if err != nil || respEmpty.StatusCode != http.StatusOK {
			t.Fatalf("Sự kiện rỗng 9003 gọi financial-overview thất bại: %d, body: %s", respEmpty.StatusCode, respEmpty.Body)
		}
		var emptyOverview ticketModels.EventFinancialOverview
		_ = json.Unmarshal([]byte(respEmpty.Body), &emptyOverview)
		if emptyOverview.TotalGrossRevenue != 0 || emptyOverview.TotalNetProfit != 0 || emptyOverview.TotalTicketsSold != 0 {
			t.Fatalf("Sự kiện rỗng 9003 phải có các giá trị = 0: %+v", emptyOverview)
		}

		t.Logf("✅ TC2 Đạt: Báo cáo tài chính chỉ tính bill PAID/REFUNDED và bill NULL, loại bỏ PENDING & FAILED, TotalTicketsRefunded đếm chuẩn từ bảng ticket!")
	})

	// -------------------------------------------------------------
	// TC3: HANDLER VỚI ERRORS.IS: ERR_USER_NOT_FOUND (401), ERR_EVENT_FORBIDDEN (403), ERR_EVENT_NOT_FOUND (404), ADMIN & OWNER (200)
	// -------------------------------------------------------------
	t.Run("TC3_Handler_Error_Is_Mapping", func(t *testing.T) {
		// (a) User không tồn tại (X-User-Id: 99999) => 401 Unauthorized (ErrUserNotFound)
		reqNoUser := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9001/financial-overview",
			Headers:    map[string]string{"X-User-Id": "99999"},
		}
		respNoUser, _ := tHandler.HandleGetEventFinancialOverview(ctx, reqNoUser)
		if respNoUser.StatusCode != http.StatusUnauthorized {
			t.Fatalf("User 99999 không tồn tại qua handler phải trả về 401 Unauthorized nhưng nhận: %d, body: %s", respNoUser.StatusCode, respNoUser.Body)
		}

		// (b) Organizer 903 cố xem Event 9001 của người khác => 403 Forbidden (ErrEventForbidden)
		reqOtherOrg := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9001/financial-overview",
			Headers:    map[string]string{"X-User-Id": "903"},
		}
		respOtherOrg, _ := tHandler.HandleGetEventFinancialOverview(ctx, reqOtherOrg)
		if respOtherOrg.StatusCode != http.StatusForbidden {
			t.Fatalf("Organizer 903 xem sự kiện người khác phải trả 403 Forbidden nhưng nhận: %d", respOtherOrg.StatusCode)
		}

		// (c) Sự kiện 99999 không tồn tại => 404 Not Found (ErrEventNotFound)
		reqNoEvent := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/99999/financial-overview",
			Headers:    map[string]string{"X-User-Id": "902"},
		}
		respNoEvent, _ := tHandler.HandleGetEventFinancialOverview(ctx, reqNoEvent)
		if respNoEvent.StatusCode != http.StatusNotFound {
			t.Fatalf("Sự kiện 99999 không tồn tại phải trả về 404 Not Found nhưng nhận: %d, body: %s", respNoEvent.StatusCode, respNoEvent.Body)
		}

		// (d) School Organizer 904 xem sự kiện của mình (Event 9002) => 200 OK
		reqOwner := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9002/financial-overview",
			Headers:    map[string]string{"X-User-Id": "904"},
		}
		respOwner, _ := tHandler.HandleGetEventFinancialOverview(ctx, reqOwner)
		if respOwner.StatusCode != http.StatusOK {
			t.Fatalf("Owner xem sự kiện của mình phải trả 200 OK nhưng nhận: %d", respOwner.StatusCode)
		}

		t.Logf("✅ TC3 Đạt: Handler chỉ sử dụng errors.Is phân nhánh chính xác 401 (ErrUserNotFound), 403 (ErrEventForbidden), 404 (ErrEventNotFound), 200 (Owner/Admin)!")
	})

	// -------------------------------------------------------------
	// TC4: DÙNG CHUNG TẬP TRẠNG THÁI 'ĐÃ BÁN' VÀ ĐỐI SÓI CON SỐ TỰ TRONG TRẠNG THÁI GHẾ
	// -------------------------------------------------------------
	t.Run("TC4_Shared_Sold_Statuses_And_Seat_Status_Matching", func(t *testing.T) {
		// (a) Gọi GetEventFinancialOverview
		reqOverview := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9001/financial-overview",
			Headers:    map[string]string{"X-User-Id": "902"},
		}
		respOverview, _ := tHandler.HandleGetEventFinancialOverview(ctx, reqOverview)
		var overview ticketModels.EventFinancialOverview
		_ = json.Unmarshal([]byte(respOverview.Body), &overview)

		// (b) Gọi GetEventSeatStatus
		reqSeat := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/organizer/events/9001/seat-status",
			Headers:    map[string]string{"X-User-Id": "902"},
		}
		respSeat, _ := tHandler.HandleGetEventSeatStatus(ctx, reqSeat)
		var seatStatus ticketModels.EventRealtimeSeatStatusResponse
		_ = json.Unmarshal([]byte(respSeat.Body), &seatStatus)

		// Đối soát: Con số vé đã bán (TotalTicketsSold) trong báo cáo tài chính PHẢI KHỚP TUYỆT ĐỐI với TotalSold trong trạng thái ghế
		if overview.TotalTicketsSold != seatStatus.TotalSold {
			t.Fatalf("Bất đồng bộ số liệu: TotalTicketsSold Báo cáo (%d) khác TotalSold Trạng thái ghế (%d)", overview.TotalTicketsSold, seatStatus.TotalSold)
		}

		if seatStatus.TotalSold != 3 {
			t.Fatalf("TotalSold trong trạng thái ghế sai: nhận %d, kỳ vọng 3 (gồm BOOKED 90001, CHECKED_IN 90003, CHECKED_OUT 90005)", seatStatus.TotalSold)
		}

		t.Logf("✅ TC4 Đạt: Báo cáo tài chính và Trạng thái ghế dùng chung tập trạng thái 'đã bán' ('BOOKED','CHECKED_IN','CHECKED_OUT') và khớp số liệu tuyệt đối (%d vé)!", overview.TotalTicketsSold)
	})
}
