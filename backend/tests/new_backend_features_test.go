package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/policy"
	eventHandler "github.com/fpt-event-services/services/event-service/handler"
	ticketHandler "github.com/fpt-event-services/services/ticket-service/handler"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	_ "github.com/lib/pq"
)

func TestNewBackendFeatures_RealDockerDB(t *testing.T) {
	connStr := "postgres://postgres:postgres@127.0.0.1:5432/fpt_event_test?sslmode=disable"

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
		t.Skipf("⏭️ [CI SKIP] Không thể mở kết nối tới Docker Postgres: %v", err)
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] Docker Postgres local không phản hồi (%v). Bỏ qua integration test trong CI.", err)
		return
	}

	ctx := context.Background()

	// Khởi tạo Handler với DB
	tHandler := ticketHandler.NewTicketHandlerWithDB(db)

	// Chuẩn bị seed user 9901 và 9902
	_, _ = db.ExecContext(ctx, "DELETE FROM subscription_payment_log WHERE user_id IN (9901, 9902)")
	_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id IN (9901, 9902)")
	_, _ = db.ExecContext(ctx, "DELETE FROM users WHERE user_id IN (9901, 9902)")

	_, err = db.ExecContext(ctx, `
		INSERT INTO users (user_id, email, full_name, password_hash, role, status)
		VALUES 
		(9901, 'organizer9901@fpt.edu.vn', 'Organizer 9901', 'hash', 'ORGANIZER', 'ACTIVE'),
		(9902, 'organizer9902@fpt.edu.vn', 'Organizer 9902', 'hash', 'ORGANIZER', 'ACTIVE')
		ON CONFLICT (user_id) DO NOTHING
	`)
	if err != nil {
		t.Fatalf("Lỗi tạo user test: %v", err)
	}

	t.Run("1_GatingEnabled_Field_In_OrganizerLimits", func(t *testing.T) {
		pol, err := policy.ResolveOrganizerPolicy(ctx, db, 9901)
		if err != nil {
			t.Fatalf("Lỗi ResolveOrganizerPolicy: %v", err)
		}
		expectedGating := config.IsFeatureEnabled(config.FlagEnableCapacityGating)
		if pol.GatingEnabled != expectedGating {
			t.Fatalf("GatingEnabled kỳ vọng %v nhưng nhận được %v", expectedGating, pol.GatingEnabled)
		}
		t.Logf("✅ Đạt (Policy Layer): Trường gatingEnabled = %v phản ánh chính xác trạng thái Feature Flag", pol.GatingEnabled)

		// Kiểm tra qua HTTP Endpoint HandleGetOrganizerLimits
		eHandler := eventHandler.NewEventHandlerWithDB(db)
		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/organizer/limits",
			HTTPMethod: "GET",
			Headers:    map[string]string{"X-User-Id": "9901"},
		}
		resp, err := eHandler.HandleGetOrganizerLimits(ctx, req)
		if err != nil {
			t.Fatalf("HandleGetOrganizerLimits trả lỗi: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Kỳ vọng 200 OK nhưng nhận %d, body: %s", resp.StatusCode, resp.Body)
		}

		var respData map[string]interface{}
		if err := json.Unmarshal([]byte(resp.Body), &respData); err != nil {
			t.Fatalf("Lỗi parse JSON limits response: %v", err)
		}
		gatingInResp, exists := respData["gatingEnabled"]
		if !exists {
			t.Fatalf("Trường gatingEnabled không có trong phản hồi JSON: %s", resp.Body)
		}
		if gatingInResp != expectedGating {
			t.Fatalf("gatingEnabled trong JSON phản hồi kỳ vọng %v nhưng nhận %v", expectedGating, gatingInResp)
		}
		t.Logf("✅ Đạt (HTTP Endpoint Layer): GET /api/v1/organizer/limits trả về JSON có trường gatingEnabled = %v", gatingInResp)
	})

	t.Run("2_PreviewUpgrade_Endpoint_ProratedCredit_Calculation", func(t *testing.T) {
		// Case A: User 9901 chưa có gói (Free) -> xem trước Pro (299k)
		reqA := events.APIGatewayProxyRequest{
			Path:       "/api/v1/subscription/preview-upgrade",
			HTTPMethod: "POST",
			Headers:    map[string]string{"X-User-Id": "9901", "X-User-Role": "ORGANIZER"},
			Body:       `{"targetTierCode":"PRO"}`,
		}
		respA, err := tHandler.HandlePreviewUpgrade(ctx, reqA)
		if err != nil {
			t.Fatalf("HandlePreviewUpgrade trả lỗi: %v", err)
		}
		if respA.StatusCode != http.StatusOK {
			t.Fatalf("Kỳ vọng 200 OK nhưng nhận %d, body: %s", respA.StatusCode, respA.Body)
		}

		var prevA ticketModels.PreviewUpgradeResponse
		if err := json.Unmarshal([]byte(respA.Body), &prevA); err != nil {
			t.Fatalf("Lỗi parse JSON preview response: %v", err)
		}
		if prevA.OriginalPrice != 299000 || prevA.ProratedCredit != 0 || prevA.NetPay != 299000 || prevA.DaysRemaining != 0 {
			t.Fatalf("Dữ liệu preview Free -> Pro không khớp: %+v", prevA)
		}
		t.Logf("✅ Case A Đạt: Free -> Pro: Giá gốc 299k, Credit 0, NetPay 299k, Days 0")

		// Case B: User 9902 đang có gói PRO còn đúng 20 ngày -> xem trước BUSINESS (1.000.000)
		var proTierID int
		err = db.QueryRowContext(ctx, "SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'").Scan(&proTierID)
		if err != nil {
			t.Fatalf("Không tìm thấy gói PRO trong subscription_tier: %v", err)
		}

		now := time.Now()
		_, err = db.ExecContext(ctx, `
			INSERT INTO user_subscription (subscription_id, user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd, prorated_credit_vnd)
			VALUES (990201, 9902, $1, 'ACTIVE', $2, $3, true, 299000, 0)
			ON CONFLICT (subscription_id) DO NOTHING
		`, proTierID, now.AddDate(0, 0, -10), now.AddDate(0, 0, 20))
		if err != nil {
			t.Fatalf("Lỗi tạo active subscription 9902: %v", err)
		}

		reqB := events.APIGatewayProxyRequest{
			Path:       "/api/v1/subscription/preview-upgrade",
			HTTPMethod: "POST",
			Headers:    map[string]string{"X-User-Id": "9902", "X-User-Role": "ORGANIZER"},
			Body:       `{"targetTierCode":"BUSINESS"}`,
		}
		respB, err := tHandler.HandlePreviewUpgrade(ctx, reqB)
		if err != nil {
			t.Fatalf("HandlePreviewUpgrade Case B trả lỗi: %v", err)
		}
		if respB.StatusCode != http.StatusOK {
			t.Fatalf("Kỳ vọng 200 OK Case B nhưng nhận %d, body: %s", respB.StatusCode, respB.Body)
		}

		var prevB ticketModels.PreviewUpgradeResponse
		if err := json.Unmarshal([]byte(respB.Body), &prevB); err != nil {
			t.Fatalf("Lỗi parse JSON preview response Case B: %v", err)
		}

		expectedCredit := (int64(299000) * 20) / 30 // 199333
		expectedNet := int64(1000000) - expectedCredit // 800667
		if prevB.OriginalPrice != 1000000 || prevB.ProratedCredit != expectedCredit || prevB.NetPay != expectedNet || prevB.DaysRemaining != 20 {
			t.Fatalf("Dữ liệu preview PRO -> BUSINESS không khớp: %+v (kỳ vọng credit=%d, net=%d)", prevB, expectedCredit, expectedNet)
		}
		t.Logf("✅ Case B Đạt: PRO (còn 20 ngày) -> BUSINESS: Gốc 1tr, Credit %d, NetPay %d, Days %d", prevB.ProratedCredit, prevB.NetPay, prevB.DaysRemaining)
	})

	t.Run("3_PublicFeeParameters_Endpoint", func(t *testing.T) {
		req := events.APIGatewayProxyRequest{
			Path:       "/api/v1/fee-policy/public-parameters",
			HTTPMethod: "GET",
		}
		resp, err := tHandler.HandleGetPublicFeeParameters(ctx, req)
		if err != nil {
			t.Fatalf("HandleGetPublicFeeParameters trả lỗi: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Kỳ vọng 200 OK nhưng nhận %d, body: %s", resp.StatusCode, resp.Body)
		}

		var pubParams ticketModels.PublicFeeParametersResponse
		if err := json.Unmarshal([]byte(resp.Body), &pubParams); err != nil {
			t.Fatalf("Lỗi parse JSON public params: %v", err)
		}

		if pubParams.FixedFeePerTicket != 1000 || pubParams.FixedFeeMinTicketPrice != 20000 {
			t.Fatalf("Giá trị tham số công khai không đúng: %+v", pubParams)
		}
		t.Logf("✅ Đạt: Tham số công khai trả về chuẩn xác: FixedFee=%d, MinTicketPrice=%d", pubParams.FixedFeePerTicket, pubParams.FixedFeeMinTicketPrice)
	})
}
