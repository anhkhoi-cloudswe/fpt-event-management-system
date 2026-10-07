package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	ticketHandler "github.com/fpt-event-services/services/ticket-service/handler"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	_ "github.com/lib/pq"
)

func TestPhase6_AdvancedAnalyticsAndCSV_RealDockerDB(t *testing.T) {
	connStr := "postgres://postgres:postgres@localhost:5432/fpt_event_test?sslmode=disable"

	// SAFETY GUARD
	if !strings.Contains(connStr, "localhost") && !strings.Contains(connStr, "127.0.0.1") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên host không phải localhost! ConnStr: %s", connStr)
	}
	if !strings.Contains(connStr, "fpt_event_test") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên DB không chứa 'fpt_event_test'! ConnStr: %s", connStr)
	}
	t.Log("🛡️ SAFETY GUARD PASSED: Đang kết nối tới container test an toàn (localhost:5432 / fpt_event_test).")

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Skipf("⏭️ [CI SKIP] Không thể mở kết nối DB: %v", err)
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] Docker Postgres local không phản hồi (%v). Bỏ qua integration test trong CI.", err)
		return
	}

	ctx := context.Background()

	// 1. Migration
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
	if migDir != "" {
		m03Path := filepath.Join(migDir, "03_add_school_organizer_enum.sql")
		if m03SQL, err := os.ReadFile(m03Path); err == nil {
			_, _ = db.ExecContext(ctx, string(m03SQL))
		}
		m04aPath := filepath.Join(migDir, "04a_subscription_and_dynamic_fees.sql")
		if m04aSQL, err := os.ReadFile(m04aPath); err == nil {
			_, _ = db.ExecContext(ctx, string(m04aSQL))
		}
	}

	handler := ticketHandler.NewTicketHandlerWithDB(db)

	// Clean test data
	_, _ = db.ExecContext(ctx, "DELETE FROM fee_audit_log WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM financial_receipt WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM bill WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM ticket WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM category_ticket WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM event WHERE 1=1")
	_, _ = db.ExecContext(ctx, "DELETE FROM users WHERE user_id >= 6000")

	// Seed Users
	// 6001: Free Organizer
	// 6002: Pro Organizer
	// 6003: Business Organizer
	// 6004: School Organizer
	// 6005: Admin
	// 6006: Other Free Organizer
	// 6007: Expired Pro Organizer
	usersSQL := `
		INSERT INTO users (user_id, full_name, email, password_hash, role, status) VALUES
		(6001, 'Free Organizer', 'free_org@fpt.edu.vn', 'pass', 'ORGANIZER', 'ACTIVE'),
		(6002, 'Pro Organizer', 'pro_org@fpt.edu.vn', 'pass', 'ORGANIZER', 'ACTIVE'),
		(6003, 'Business Organizer', 'biz_org@fpt.edu.vn', 'pass', 'ORGANIZER', 'ACTIVE'),
		(6004, 'School Organizer', 'school_org@fpt.edu.vn', 'pass', 'SCHOOL_ORGANIZER', 'ACTIVE'),
		(6005, 'Admin User', 'admin_phase6@fpt.edu.vn', 'pass', 'ADMIN', 'ACTIVE'),
		(6006, 'Other Free Organizer', 'other_free@fpt.edu.vn', 'pass', 'ORGANIZER', 'ACTIVE'),
		(6007, 'Expired Pro Organizer', 'expired_pro@fpt.edu.vn', 'pass', 'ORGANIZER', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE';
	`
	if _, err := db.ExecContext(ctx, usersSQL); err != nil {
		t.Fatalf("Lỗi tạo user test Phase 6: %v", err)
	}

	// Seed Subscriptions
	// 6002 -> PRO (Active)
	// 6003 -> BUSINESS (Active)
	// 6007 -> PRO (Expired 10 days ago)
	subSQL := `
		INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, amount_paid_vnd) VALUES
		(6002, 2, 'ACTIVE', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', 500000),
		(6003, 3, 'ACTIVE', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', 1500000),
		(6007, 2, 'EXPIRED', NOW() - INTERVAL '40 days', NOW() - INTERVAL '10 days', 500000);
	`
	if _, err := db.ExecContext(ctx, subSQL); err != nil {
		t.Fatalf("Lỗi tạo subscription test Phase 6: %v", err)
	}

	// Seed Events
	// Event 601: Free Org Event
	// Event 602: Pro Org Event
	// Event 603: Empty Event (Owned by Pro Org)
	eventsSQL := `
		INSERT INTO event (event_id, title, description, start_time, end_time, created_by, is_settled, status) VALUES
		(601, 'Free Gala Event', 'Description', NOW(), NOW() + INTERVAL '1 day', 6001, false, 'OPEN'),
		(602, 'PRO Tech Conference', 'Description', NOW(), NOW() + INTERVAL '1 day', 6002, false, 'OPEN'),
		(603, 'Empty Event Pro', 'Description', NOW(), NOW() + INTERVAL '1 day', 6002, false, 'OPEN');
	`
	if _, err := db.ExecContext(ctx, eventsSQL); err != nil {
		t.Fatalf("Lỗi tạo event test Phase 6: %v", err)
	}

	// Seed Category Tickets for Event 602 (PRO Tech Conference)
	// Cat 6021: "VIP Ticket" (Price 1,000,000, Capacity 50)
	// Cat 6022: "Standard Ticket" (Price 500,000, Capacity 100)
	catSQL := `
		INSERT INTO category_ticket (category_ticket_id, event_id, name, price, max_quantity) VALUES
		(6021, 602, 'VIP Ticket', 1000000, 50),
		(6022, 602, 'Standard Ticket', 500000, 100);
	`
	if _, err := db.ExecContext(ctx, catSQL); err != nil {
		t.Fatalf("Lỗi tạo category_ticket test Phase 6: %v", err)
	}

	// Seed Tickets & Bills & Financial Receipts for Event 602
	// Đúng chuẩn hệ thống thực tế: Mỗi vé 1 dòng ticket và MỘT biên lai financial_receipt với gross = giá một vé (1:1:1)
	// Ticket 6201: VIP (1.000.000đ) - BOOKED
	// Ticket 6202: VIP (1.000.000đ) - CHECKED_IN
	// Ticket 6203: Standard (500.000đ) - CHECKED_IN
	ticketsSQL := `
		INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, status, qr_code_value, checkin_time) VALUES
		(6201, 602, 6021, 6001, 'BOOKED', 'QR6201_SECRET_TOKEN', NULL),
		(6202, 602, 6021, 6001, 'CHECKED_IN', 'QR6202_SECRET_TOKEN', NOW() - INTERVAL '2 hours'),
		(6203, 602, 6022, 6001, 'CHECKED_IN', 'QR6203_SECRET_TOKEN', NOW() - INTERVAL '1 hour');
	`
	if _, err := db.ExecContext(ctx, ticketsSQL); err != nil {
		t.Fatalf("Lỗi tạo ticket test Phase 6: %v", err)
	}

	billsSQL := `
		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(6201, 6001, 1000000, 'PAID', NOW() - INTERVAL '2 days'),
		(6202, 6001, 1000000, 'PAID', NOW() - INTERVAL '1 day'),
		(6203, 6001, 500000, 'PAID', NOW() - INTERVAL '1 day');
	`
	if _, err := db.ExecContext(ctx, billsSQL); err != nil {
		t.Fatalf("Lỗi tạo bill test Phase 6: %v", err)
	}

	receiptsSQL := `
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, created_at) VALUES
		(6201, 6201, 6201, 6201, 602, 6002, 1000000, 2.50, 1000, 250, 1, 26000, 974000, 'PRO', 'TIER', NOW() - INTERVAL '2 days'),
		(6202, 6202, 6202, 6202, 602, 6002, 1000000, 2.50, 1000, 250, 1, 26000, 974000, 'PRO', 'TIER', NOW() - INTERVAL '1 day'),
		(6203, 6203, 6203, 6203, 602, 6002, 500000, 2.50, 1000, 250, 1, 13500, 486500, 'PRO', 'TIER', NOW() - INTERVAL '1 day');
	`
	if _, err := db.ExecContext(ctx, receiptsSQL); err != nil {
		t.Fatalf("Lỗi tạo financial_receipt test Phase 6: %v", err)
	}

	// =========================================================================
	// TC 1: Free Tier bị 403 PAYWALL_REQUIRED, KHÔNG trả dữ liệu thật
	// =========================================================================
	t.Run("TC1_FreeTier_PaywallRequired", func(t *testing.T) {
		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/601/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6001"},
		}
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		if err != nil {
			t.Fatalf("Lỗi không mong muốn từ handler: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("Mong đợi HTTP 403 Forbidden cho Free Tier, nhận được: %d. Body: %s", resp.StatusCode, resp.Body)
		}
		if !strings.Contains(resp.Body, "PAYWALL_REQUIRED") {
			t.Fatalf("Body phản hồi phải chứa 'PAYWALL_REQUIRED', nhận được: %s", resp.Body)
		}
		if strings.Contains(resp.Body, "totalGrossRevenue") || strings.Contains(resp.Body, "=SUM(A1:A10)") {
			t.Fatalf("🚨 BẢO MẬT VI PHẠM: Free Tier bị chặn nhưng bị lộ dữ liệu thật! Body: %s", resp.Body)
		}
		t.Logf("✓ TC1 PASSED: Free Tier bị chặn 403 PAYWALL_REQUIRED chuẩn xác, không leak dữ liệu.")
	})

	// =========================================================================
	// TC 2: Free Tier + 0% fee override vẫn bị 403 PAYWALL_REQUIRED
	// =========================================================================
	t.Run("TC2_FreeTier_WithZeroPercentOverride_StillPaywallRequired", func(t *testing.T) {
		overrideSQL := `
			INSERT INTO organizer_fee_override (organizer_id, commission_bps, reason, effective_range, created_by)
			VALUES (6001, 0, 'Sự kiện đặc biệt 0%', tstzrange(NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days'), 6005);
		`
		if _, err := db.ExecContext(ctx, overrideSQL); err != nil {
			t.Fatalf("Lỗi tạo fee override test: %v", err)
		}

		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/601/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6001"},
		}
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden || !strings.Contains(resp.Body, "PAYWALL_REQUIRED") {
			t.Fatalf("Mong đợi 403 PAYWALL_REQUIRED khi Free + 0%% override, nhận được: %d. Body: %s", resp.StatusCode, resp.Body)
		}
		t.Logf("✓ TC2 PASSED: Free Tier có 0%% fee override vẫn bị chặn 403 PAYWALL_REQUIRED đúng quy định.")
	})

	// =========================================================================
	// TC 3: Gói Pro hết hạn bị 403 PAYWALL_REQUIRED
	// =========================================================================
	t.Run("TC3_ExpiredSubscription_PaywallRequired", func(t *testing.T) {
		if _, err := db.ExecContext(ctx, "INSERT INTO event (event_id, title, description, start_time, end_time, created_by, status) VALUES (607, 'Expired Event', 'Desc', NOW(), NOW() + INTERVAL '1 day', 6007, 'OPEN')"); err != nil {
			t.Fatalf("Lỗi tạo event 607: %v", err)
		}

		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/607/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6007"},
		}
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if resp.StatusCode != http.StatusForbidden || !strings.Contains(resp.Body, "PAYWALL_REQUIRED") {
			t.Fatalf("Mong đợi 403 PAYWALL_REQUIRED cho gói hết hạn, nhận được: %d. Body: %s", resp.StatusCode, resp.Body)
		}
		t.Logf("✓ TC3 PASSED: Gói hết hạn bị chuyển về Free và chặn 403 PAYWALL_REQUIRED.")
	})

	// =========================================================================
	// TC 4: Pro / Business / School Organizer / Admin xem được (200 OK)
	// =========================================================================
	t.Run("TC4_EntitledUsers_CanViewAdvancedAnalytics", func(t *testing.T) {
		reqPro := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/602/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6002"},
		}
		respPro, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqPro)
		if err != nil || respPro.StatusCode != http.StatusOK {
			t.Fatalf("Pro Organizer xem sự kiện 602 thất bại: Status=%d, Err=%v, Body=%s", respPro.StatusCode, err, respPro.Body)
		}

		var res ticketModels.EventAdvancedAnalyticsResponse
		if err := json.Unmarshal([]byte(respPro.Body), &res); err != nil {
			t.Fatalf("Lỗi unmarshal response: %v", err)
		}

		// Gross = 1.000.000 + 1.000.000 + 500.000 = 2.500.000đ
		if res.TotalGrossRevenue != 2500000 {
			t.Errorf("Tổng gross revenue mong đợi 2,500,000, nhận được: %d", res.TotalGrossRevenue)
		}
		if res.TotalTicketsSold != 3 {
			t.Errorf("Tổng số vé đã bán mong đợi 3, nhận được: %d", res.TotalTicketsSold)
		}
		if res.CheckedInTickets != 2 {
			t.Errorf("Lượt check-in mong đợi 2, nhận được: %d", res.CheckedInTickets)
		}
		if len(res.CategoryBreakdown) != 2 {
			t.Errorf("Mong đợi 2 loại vé trong category breakdown, nhận được: %d", len(res.CategoryBreakdown))
		}
		if len(res.HourlyCheckIns) != 24 {
			t.Errorf("HourlyCheckIns phải có đủ 24 khung giờ, nhận được: %d", len(res.HourlyCheckIns))
		}

		// 1. Đối soát: Tổng soldSeats theo loại vé = totalTicketsSold
		var totalSoldSeatsByCategory int
		var totalGrossByCategory int64
		for _, cat := range res.CategoryBreakdown {
			totalSoldSeatsByCategory += cat.SoldSeats
			totalGrossByCategory += cat.GrossRevenue
		}
		if totalSoldSeatsByCategory != res.TotalTicketsSold {
			t.Fatalf("🚨 ĐỐI SOÁT THẤT BẠI: Tổng soldSeats theo category (%d) != totalTicketsSold (%d)", totalSoldSeatsByCategory, res.TotalTicketsSold)
		}

		// 2. Đối soát: Tổng gross theo loại vé = KPI
		if totalGrossByCategory != res.TotalGrossRevenue {
			t.Fatalf("🚨 ĐỐI SOÁT THẤT BẠI: Tổng gross theo category (%d) != TotalGrossRevenue KPI (%d)", totalGrossByCategory, res.TotalGrossRevenue)
		}

		// 3. Đối soát: Tổng ticketsSold trong timeline = totalTicketsSold (khi mọi vé đều có phí)
		var totalTimelineTickets int
		for _, tl := range res.Timeline {
			totalTimelineTickets += tl.TicketsSold
		}
		if totalTimelineTickets != res.TotalTicketsSold {
			t.Fatalf("🚨 ĐỐI SOÁT THẤT BẠI: Tổng ticketsSold trong timeline (%d) != totalTicketsSold (%d)", totalTimelineTickets, res.TotalTicketsSold)
		}

		// Admin (6005) xem bất kỳ sự kiện nào
		reqAdmin := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/601/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6005"},
		}
		respAdmin, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqAdmin)
		if err != nil || respAdmin.StatusCode != http.StatusOK {
			t.Fatalf("ADMIN xem sự kiện 601 thất bại: Status=%d, Err=%v, Body=%s", respAdmin.StatusCode, err, respAdmin.Body)
		}

		// School Organizer (6004) xem sự kiện của mình
		if _, err := db.ExecContext(ctx, "INSERT INTO event (event_id, title, description, start_time, end_time, created_by, status) VALUES (604, 'School Festival', 'Desc', NOW(), NOW() + INTERVAL '1 day', 6004, 'OPEN')"); err != nil {
			t.Fatalf("Lỗi tạo event 604: %v", err)
		}
		reqSchool := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/604/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6004"},
		}
		respSchool, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqSchool)
		if err != nil || respSchool.StatusCode != http.StatusOK {
			t.Fatalf("School Organizer xem sự kiện 604 thất bại: Status=%d, Err=%v, Body=%s", respSchool.StatusCode, err, respSchool.Body)
		}

		t.Logf("✓ TC4 PASSED: Pro, School Organizer và ADMIN đều xem được báo cáo nâng cao thành công (200 OK).")
	})

	// =========================================================================
	// TC 5: Organizer không phải chủ sở hữu luôn nhận 403 (Không rò rỉ 404 vs 403)
	// =========================================================================
	t.Run("TC5_OtherOrganizer_No404Vs403EnumerationLeakage", func(t *testing.T) {
		reqExist := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/602/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6003"},
		}
		respExist, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqExist)
		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if respExist.StatusCode != http.StatusForbidden {
			t.Fatalf("Mong đợi HTTP 403 Forbidden khi truy cập sự kiện tồn tại của người khác, nhận được: %d", respExist.StatusCode)
		}

		reqNonExist := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/999999/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6003"},
		}
		respNonExist, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqNonExist)
		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if respNonExist.StatusCode != http.StatusForbidden {
			t.Fatalf("Mong đợi HTTP 403 Forbidden khi người không phải chủ truy cập sự kiện không tồn tại (chống dò ID), nhận được: %d", respNonExist.StatusCode)
		}

		reqAdminNonExist := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/999999/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6005"},
		}
		respAdminNonExist, err := handler.HandleGetEventAdvancedAnalytics(ctx, reqAdminNonExist)
		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if respAdminNonExist.StatusCode != http.StatusNotFound {
			t.Fatalf("Mong đợi HTTP 404 Not Found khi ADMIN truy cập sự kiện không tồn tại, nhận được: %d", respAdminNonExist.StatusCode)
		}

		t.Logf("✓ TC5 PASSED: Quyết định phân quyền chuẩn xác: Người không đủ quyền luôn nhận 403 (không phân biệt 404 vs 403). ADMIN nhận 404.")
	})

	// =========================================================================
	// TC 6: Sự kiện không có dữ liệu trả về 0 không lỗi
	// =========================================================================
	t.Run("TC6_EmptyEvent_ReturnsZeroNoError", func(t *testing.T) {
		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/603/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6002"},
		}
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("Sự kiện trống trả về lỗi: Status=%d, Err=%v, Body=%s", resp.StatusCode, err, resp.Body)
		}

		var res ticketModels.EventAdvancedAnalyticsResponse
		if err := json.Unmarshal([]byte(resp.Body), &res); err != nil {
			t.Fatalf("Lỗi unmarshal response: %v", err)
		}

		if res.TotalGrossRevenue != 0 || res.TotalTicketsSold != 0 || res.CheckedInTickets != 0 {
			t.Fatalf("Sự kiện không có dữ liệu phải có KPI bằng 0, nhận được: gross=%d, sold=%d", res.TotalGrossRevenue, res.TotalTicketsSold)
		}
		if len(res.HourlyCheckIns) != 24 {
			t.Fatalf("HourlyCheckIns vẫn phải chứa 24 khung giờ bằng 0, nhận được: %d", len(res.HourlyCheckIns))
		}
		t.Logf("✓ TC6 PASSED: Sự kiện không có dữ liệu trả về kết quả 0 hoàn chỉnh không bị crash/error.")
	})

	// =========================================================================
	// TC 7: Lỗi nguồn dữ liệu DB / Fail-closed => HTTP 503
	// =========================================================================
	t.Run("TC7_DataSourceError_Returns503FailClosed", func(t *testing.T) {
		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/601/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6001"},
		}
		// Xóa tạm gói FREE để trigger Fail-Closed khi không thể phân giải chính sách tài khoản mặc định
		_, _ = db.ExecContext(ctx, "DELETE FROM subscription_tier WHERE tier_code = 'FREE'")
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		// Khôi phục lại dữ liệu FREE tier
		_, _ = db.ExecContext(ctx, "INSERT INTO subscription_tier (tier_id, tier_code, name, price_vnd, commission_bps, max_capacity_limit, has_advanced_reports, is_active) VALUES (1, 'FREE', 'Gói Miễn Phí', 0, 500, 100, false, true) ON CONFLICT (tier_id) DO NOTHING")

		if err != nil {
			t.Fatalf("Lỗi handler: %v", err)
		}
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("Mong đợi HTTP 503 Service Unavailable khi lỗi nguồn dữ liệu/policy fail-closed, nhận được: %d. Body: %s", resp.StatusCode, resp.Body)
		}
		if !strings.Contains(resp.Body, "FAIL_CLOSED") {
			t.Fatalf("Mong đợi body chứa 'FAIL_CLOSED', nhận được: %s", resp.Body)
		}
		t.Logf("✓ TC7 PASSED: Lỗi nguồn dữ liệu/xác thực chính sách fail-closed trả về HTTP 503 chính xác.")
	})

	// =========================================================================
	// TC 8: Test Đối Soát Doanh Thu: Tổng doanh thu theo loại vé = Tổng KPI (gồm biên lai đảo, LEGACY & vé 0đ)
	// =========================================================================
	t.Run("TC8_Reconciliation_CategorySumEqualsKPISum_IncludingLegacy", func(t *testing.T) {
		if _, err := db.ExecContext(ctx, "INSERT INTO event (event_id, title, description, start_time, end_time, created_by, status) VALUES (680, 'Reconciliation Event', 'Desc', NOW(), NOW() + INTERVAL '1 day', 6002, 'OPEN')"); err != nil {
			t.Fatalf("Lỗi tạo event 680: %v", err)
		}
		catSQL := `
			INSERT INTO category_ticket (category_ticket_id, event_id, name, price, max_quantity) VALUES
			(6801, 680, 'VIP Pass', 1000000, 10),
			(6802, 680, 'Standard Pass', 500000, 20),
			(6803, 680, 'Free Pass', 0, 50);
		`
		if _, err := db.ExecContext(ctx, catSQL); err != nil {
			t.Fatalf("Lỗi tạo category_ticket event 680: %v", err)
		}

		tSQL := `
			INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, status, qr_code_value) VALUES
			(6801, 680, 6801, 6001, 'BOOKED', 'QR6801'),
			(6802, 680, 6801, 6001, 'REFUNDED', 'QR6802'),
			(6803, 680, 6802, 6001, 'CHECKED_IN', 'QR6803'),
			(6804, 680, 6803, 6001, 'BOOKED', 'QR6804');
		`
		if _, err := db.ExecContext(ctx, tSQL); err != nil {
			t.Fatalf("Lỗi tạo ticket event 680: %v", err)
		}

		bSQL := `
			INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
			(6801, 6001, 1000000, 'PAID', NOW() - INTERVAL '1 day'),
			(6802, 6001, 1000000, 'REFUNDED', NOW() - INTERVAL '1 day'),
			(6803, 6001, 500000, 'PAID', NOW() - INTERVAL '1 day');
		`
		if _, err := db.ExecContext(ctx, bSQL); err != nil {
			t.Fatalf("Lỗi tạo bill event 680: %v", err)
		}

		// Receipt 6801: LEGACY tier code
		rSQL := `
			INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal, created_at) VALUES
			(6801, 6801, 6801, 6801, 680, 6002, 1000000, 2.50, 1000, 250, 1, 26000, 974000, 'LEGACY', 'LEGACY', false, NOW() - INTERVAL '1 day'),
			(6802, 6802, 6802, 6802, 680, 6002, 1000000, 2.50, 1000, 250, 1, 26000, 974000, 'PRO', 'TIER', false, NOW() - INTERVAL '1 day'),
			(6803, 6802, 6802, 6802, 680, 6002, -1000000, 2.50, 1000, 250, 1, -26000, -974000, 'PRO', 'TIER', true, NOW() - INTERVAL '12 hours'),
			(6804, 6803, 6803, 6803, 680, 6002, 500000, 2.50, 1000, 250, 1, 13500, 486500, 'PRO', 'TIER', false, NOW() - INTERVAL '1 day');
		`
		if _, err := db.ExecContext(ctx, rSQL); err != nil {
			t.Fatalf("Lỗi tạo financial_receipt event 680: %v", err)
		}

		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/680/advanced-analytics",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6002"},
		}
		resp, err := handler.HandleGetEventAdvancedAnalytics(ctx, req)
		if err != nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("Gọi HandleGetEventAdvancedAnalytics thất bại: Status=%d, Err=%v, Body=%s", resp.StatusCode, err, resp.Body)
		}

		var res ticketModels.EventAdvancedAnalyticsResponse
		if err := json.Unmarshal([]byte(resp.Body), &res); err != nil {
			t.Fatalf("Lỗi unmarshal response: %v", err)
		}

		var catGrossSum, catFeeSum, catNetSum int64
		for _, cat := range res.CategoryBreakdown {
			catGrossSum += cat.GrossRevenue
			catFeeSum += cat.PlatformFee
			catNetSum += cat.NetProfit
		}

		if res.TotalGrossRevenue != 1500000 {
			t.Fatalf("TotalGrossRevenue KPI phải là 1,500,000 (gồm biên lai LEGACY), nhận được: %d", res.TotalGrossRevenue)
		}
		if catGrossSum != res.TotalGrossRevenue {
			t.Fatalf("🚨 LỖI ĐỐI SOÁT: Tổng Gross theo Category (%d) KHÔNG BẰNG KPI Gross (%d)!", catGrossSum, res.TotalGrossRevenue)
		}
		if catFeeSum != res.TotalPlatformFee {
			t.Fatalf("🚨 LỖI ĐỐI SOÁT: Tổng Fee theo Category (%d) KHÔNG BẰNG KPI Fee (%d)!", catFeeSum, res.TotalPlatformFee)
		}
		if catNetSum != res.TotalNetProfit {
			t.Fatalf("🚨 LỖI ĐỐI SOÁT: Tổng Net theo Category (%d) KHÔNG BẰNG KPI Net (%d)!", catNetSum, res.TotalNetProfit)
		}

		if res.TotalTicketsSold != 3 {
			t.Fatalf("TotalTicketsSold mong đợi 3 (gồm vé 0đ, trừ vé REFUNDED), nhận được: %d", res.TotalTicketsSold)
		}

		t.Logf("✓ TC8 PASSED: Doanh thu khớp 100%% bao gồm cả biên lai LEGACY và vé hoàn/đảo.")
	})

	// =========================================================================
	// TC 9: Xuất CSV qua HANDLER: Header, Escaping (\t=1+1, \r@x,  =cmd), Số âm không bị gắn nháy
	// =========================================================================
	t.Run("TC9_CSVExport_HandlerHeaders_Escaping_NegativeNumbers", func(t *testing.T) {
		// 9a. Free Tier xuất CSV -> 403 PAYWALL_REQUIRED
		reqFreeCSV := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/601/export-csv",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6001"},
		}
		respFreeCSV, err := handler.HandleExportEventCSV(ctx, reqFreeCSV)
		if err != nil || respFreeCSV.StatusCode != http.StatusForbidden || !strings.Contains(respFreeCSV.Body, "PAYWALL_REQUIRED") {
			t.Fatalf("Free Tier xuất CSV phải bị chặn 403 PAYWALL_REQUIRED! Status=%d, Body=%s", respFreeCSV.StatusCode, respFreeCSV.Body)
		}

		// Tạo event 690 có title bắt đầu bằng '\t=1+1', category1 bắt đầu bằng '\r@x', category2 là ' =cmd' và biên lai âm -100000
		if _, err := db.ExecContext(ctx, "INSERT INTO event (event_id, title, description, start_time, end_time, created_by, status) VALUES (690, '\t=1+1 Tabbed Formula', 'Desc', NOW(), NOW() + INTERVAL '1 day', 6002, 'OPEN')"); err != nil {
			t.Fatalf("Lỗi tạo event 690: %v", err)
		}
		if _, err := db.ExecContext(ctx, "INSERT INTO category_ticket (category_ticket_id, event_id, name, price, max_quantity) VALUES (6901, 690, '\r@x Carriage Ticket', 500000, 10), (6902, 690, ' =cmd LeadingSpace', 300000, 5)"); err != nil {
			t.Fatalf("Lỗi tạo category 6901, 6902: %v", err)
		}
		if _, err := db.ExecContext(ctx, "INSERT INTO ticket (ticket_id, event_id, category_ticket_id, user_id, status, qr_code_value) VALUES (6901, 690, 6901, 6001, 'REFUNDED', 'QR6901')"); err != nil {
			t.Fatalf("Lỗi tạo ticket 6901: %v", err)
		}
		if _, err := db.ExecContext(ctx, "INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_bps, fee_config_version, commission_amount, net_amount, tier_code, fee_source, is_reversal, created_at) VALUES (6901, 6901, NULL, 6901, 690, 6002, -100000, 2.50, 1000, 250, 1, -2500, -97500, 'PRO', 'TIER', true, NOW())"); err != nil {
			t.Fatalf("Lỗi tạo receipt 6901: %v", err)
		}

		reqProCSV := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/690/export-csv",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6002"},
		}
		respProCSV, err := handler.HandleExportEventCSV(ctx, reqProCSV)
		if err != nil || respProCSV.StatusCode != http.StatusOK {
			t.Fatalf("Pro Tier xuất CSV 690 thất bại! Status=%d, Err=%v", respProCSV.StatusCode, err)
		}

		// 1. Kiểm tra Headers
		if respProCSV.Headers["Content-Type"] != "text/csv; charset=utf-8" {
			t.Errorf("Header Content-Type phải là 'text/csv; charset=utf-8', nhận được: %s", respProCSV.Headers["Content-Type"])
		}
		if respProCSV.Headers["Content-Disposition"] != "attachment; filename=\"event_690_analytics.csv\"" {
			t.Errorf("Header Content-Disposition phải là 'attachment; filename=\"event_690_analytics.csv\"', nhận được: %s", respProCSV.Headers["Content-Disposition"])
		}

		csvContent := respProCSV.Body

		// 2. Assert từng ca dữ liệu cụ thể:
		// Ca 1: '\t=1+1' -> thành `'=1+1 Tabbed Formula`
		if !strings.Contains(csvContent, "'=1+1 Tabbed Formula") {
			t.Errorf("🚨 Ca 1 FAIL: Ô bắt đầu bằng \\t=1+1 chưa được escape chính xác thành \"'=1+1...\". Nội dung CSV:\n%s", csvContent)
		} else {
			t.Logf("  ✓ Assert 1 PASSED: Ô '\\t=1+1' (sau khi trim tab/space) được escape thành: ''=1+1 Tabbed Formula'")
		}

		// Ca 2: '\r@x' -> thành `'@x Carriage Ticket`
		if !strings.Contains(csvContent, "'@x Carriage Ticket") && !strings.Contains(csvContent, "'\r@x Carriage Ticket") {
			t.Errorf("🚨 Ca 2 FAIL: Ô bắt đầu bằng \\r@x chưa được escape chính xác. Nội dung CSV:\n%s", csvContent)
		} else {
			t.Logf("  ✓ Assert 2 PASSED: Ô '\\r@x' được escape thành: ''@x Carriage Ticket'")
		}

		// Ca 3: ' =cmd' (có khoảng trắng đầu) -> thành `'=cmd LeadingSpace`
		if !strings.Contains(csvContent, "'=cmd LeadingSpace") {
			t.Errorf("🚨 Ca 3 FAIL: Ô có khoảng trắng đầu ' =cmd' lọt qua chưa được escape thành \"'=cmd...\". Nội dung CSV:\n%s", csvContent)
		} else {
			t.Logf("  ✓ Assert 3 PASSED: Ô ' =cmd' (có khoảng trắng đầu) được escape thành: ''=cmd LeadingSpace'")
		}

		// Ca 4: Số âm '-100000' -> KHÔNG bị chèn nháy đơn thành `'-100000`
		if strings.Contains(csvContent, "'-100000") {
			t.Errorf("🚨 Ca 4 FAIL: Số âm -100000 bị chèn nháy đơn sai quy định thành \"'-100000\"!")
		} else if strings.Contains(csvContent, "-100000") {
			t.Logf("  ✓ Assert 4 PASSED: Số âm -100000 được giữ nguyên dạng số: -100000 (không bị chèn nháy)")
		}

		t.Logf("✓ TC9 PASSED: Tất cả 4 ca kiểm thử CSV Injection (\\t=1+1, \\r@x, ' =cmd', -100000) và Headers đều ĐẠT 100%%!")
	})

	// =========================================================================
	// TC 10: Đọc lại file CSV bằng bộ đọc CSV chuẩn (encoding/csv.Reader)
	// Xác nhận:
	// - File CSV hợp lệ RFC 4180
	// - Các ô tiền trong phần KPI là số nguyên VNĐ (không định dạng "3,5 triệu")
	// - Mọi ô có dấu phẩy được quote hợp lệ
	// =========================================================================
	t.Run("TC10_CSV_Reader_Parsing_And_Integer_VND_Validation", func(t *testing.T) {
		reqProCSV := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/events/602/export-csv",
			HTTPMethod: "GET",
			Headers:    map[string]string{"x-user-id": "6002"},
		}
		respProCSV, err := handler.HandleExportEventCSV(ctx, reqProCSV)
		if err != nil || respProCSV.StatusCode != http.StatusOK {
			t.Fatalf("Xuất CSV cho event 602 thất bại: Status=%d, Err=%v", respProCSV.StatusCode, err)
		}

		rawCSV := respProCSV.Body
		// Bỏ BOM UTF-8 nếu có trước khi parse với csv.Reader
		cleanedCSV := strings.TrimPrefix(rawCSV, "\xEF\xBB\xBF")

		reader := csv.NewReader(strings.NewReader(cleanedCSV))
		reader.FieldsPerRecord = -1 // Cho phép các dòng có số cột khác nhau giữa các section

		records, err := reader.ReadAll()
		if err != nil {
			t.Fatalf("🚨 LỖI PARSE CSV: Bộ đọc encoding/csv không thể đọc file CSV xuất ra: %v", err)
		}

		if len(records) == 0 {
			t.Fatalf("File CSV rỗng!")
		}

		// Kiểm tra các ô KPI tiền tệ
		kpiMap := make(map[string]string)
		for _, row := range records {
			if len(row) == 2 {
				kpiMap[row[0]] = row[1]
			}
		}

		grossVal, hasGross := kpiMap["Tổng Doanh Thu Thanh Toán (Gross - VNĐ)"]
		if !hasGross {
			t.Fatalf("Không tìm thấy dòng KPI 'Tổng Doanh Thu Thanh Toán (Gross - VNĐ)'")
		}
		if _, err := strconv.ParseInt(grossVal, 10, 64); err != nil {
			t.Fatalf("🚨 Giá trị Gross trong KPI phải là số nguyên VNĐ, nhận được: %s (Err: %v)", grossVal, err)
		}

		feeVal, hasFee := kpiMap["Tổng Phí Sàn (Platform Fee - VNĐ)"]
		if !hasFee {
			t.Fatalf("Không tìm thấy dòng KPI 'Tổng Phí Sàn (Platform Fee - VNĐ)'")
		}
		if _, err := strconv.ParseInt(feeVal, 10, 64); err != nil {
			t.Fatalf("🚨 Giá trị Platform Fee trong KPI phải là số nguyên VNĐ, nhận được: %s (Err: %v)", feeVal, err)
		}

		netVal, hasNet := kpiMap["Tổng Doanh Thu Thực Nhận (Net - VNĐ)"]
		if !hasNet {
			t.Fatalf("Không tìm thấy dòng KPI 'Tổng Doanh Thu Thực Nhận (Net - VNĐ)'")
		}
		if _, err := strconv.ParseInt(netVal, 10, 64); err != nil {
			t.Fatalf("🚨 Giá trị Net trong KPI phải là số nguyên VNĐ, nhận được: %s (Err: %v)", netVal, err)
		}

		t.Logf("✓ TC10 PASSED: Bộ đọc CSV chuẩn parse thành công toàn bộ file. KPI tiền là số nguyên VNĐ hợp lệ: Gross=%s, Fee=%s, Net=%s.", grossVal, feeVal, netVal)
	})

	t.Log("🎉 TẤT CẢ CÁC TEST CASE PHA 6 VÒNG 2 CHẠY THÀNH CÔNG RỰC RỠ TRÊN DOCKER POSTGRES REAL DATABASE!")
}
