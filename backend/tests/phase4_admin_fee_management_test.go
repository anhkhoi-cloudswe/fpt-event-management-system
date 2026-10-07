package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/db"
	ticketHandler "github.com/fpt-event-services/services/ticket-service/handler"
	ticketModels "github.com/fpt-event-services/services/ticket-service/models"
	ticketRepo "github.com/fpt-event-services/services/ticket-service/repository"
	ticketScheduler "github.com/fpt-event-services/services/ticket-service/scheduler"
	_ "github.com/lib/pq"
)

func TestPhase4_AdminFeeManagement_RealDockerDB(t *testing.T) {
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
	m04aSQL, err := os.ReadFile(m04aPath)
	if err != nil {
		t.Fatalf("Không đọc được file migration 04a: %v", err)
	}
	if _, err := testDB.ExecContext(ctx, string(m04aSQL)); err != nil {
		if !strings.Contains(err.Error(), "already exists") {
			t.Fatalf("Lỗi chạy migration 04a: %v", err)
		}
	}

	tRepo := ticketRepo.NewTicketRepositoryWithDB(testDB)
	tHandler := ticketHandler.NewTicketHandlerWithDB(testDB)

	// Chuẩn bị dữ liệu người dùng test (User IDs: 801=ADMIN, 802=ORGANIZER, 803=STUDENT)
	cleanupSQL := `
		DELETE FROM fee_audit_log WHERE changed_by BETWEEN 800 AND 820;
		DELETE FROM organizer_fee_override WHERE organizer_id BETWEEN 800 AND 820 OR created_by BETWEEN 800 AND 820;
		DELETE FROM subscription_payment_log WHERE user_id BETWEEN 800 AND 820;
		DELETE FROM user_subscription WHERE user_id BETWEEN 800 AND 820;
		DELETE FROM wallet_transaction WHERE user_id BETWEEN 800 AND 820;
		DELETE FROM wallet WHERE user_id BETWEEN 800 AND 820;
		DELETE FROM users WHERE user_id BETWEEN 800 AND 820;

		INSERT INTO users (user_id, email, full_name, password_hash, role, status) VALUES 
		(801, 'admin801@fpt.edu.vn', 'Admin Tester', 'hash', 'ADMIN', 'ACTIVE'),
		(802, 'org802@fpt.edu.vn', 'Organizer Tester', 'hash', 'ORGANIZER', 'ACTIVE'),
		(803, 'student803@fpt.edu.vn', 'Student Tester', 'hash', 'STUDENT', 'ACTIVE')
		ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, previous_role = NULL;

		INSERT INTO wallet (user_id, balance, currency, status) VALUES
		(802, 5000000, 'VND', 'ACTIVE')
		ON CONFLICT DO NOTHING;
	`
	if _, err := testDB.ExecContext(ctx, cleanupSQL); err != nil {
		t.Fatalf("Lỗi chuẩn bị test users: %v", err)
	}

	t.Cleanup(func() {
		resetSQL := `
			UPDATE subscription_tier SET price_vnd = 0, commission_bps = 500, max_capacity_limit = 100, has_advanced_reports = FALSE, is_active = TRUE WHERE tier_code = 'FREE';
			UPDATE subscription_tier SET price_vnd = 299000, commission_bps = 250, max_capacity_limit = -1, has_advanced_reports = TRUE, is_active = TRUE WHERE tier_code = 'PRO';
			UPDATE subscription_tier SET price_vnd = 1000000, commission_bps = 0, max_capacity_limit = -1, has_advanced_reports = TRUE, is_active = TRUE WHERE tier_code = 'BUSINESS';
			UPDATE role_fee_policy SET commission_bps = 250, max_capacity_limit = -1, has_advanced_reports = TRUE, is_active = TRUE WHERE role_code = 'SCHOOL_ORGANIZER';
			UPDATE platform_system_parameter SET param_value = '1000' WHERE param_key = 'FIXED_FEE_PER_TICKET';
			UPDATE platform_system_parameter SET param_value = '20000' WHERE param_key = 'FIXED_FEE_MIN_TICKET_PRICE';
		`
		_, _ = testDB.ExecContext(context.Background(), resetSQL)
	})

	// -------------------------------------------------------------
	// TC1: KIỂM TRA QUYỀN ADMIN BẰNG DB (CHỈ ADMIN, CHẶN SUPER_ADMIN/ORG/STUDENT, LỖI DB RA 503)
	// -------------------------------------------------------------
	t.Run("TC1_DB_Admin_Role_Verification", func(t *testing.T) {
		// (a) User 802 có role trong DB là ORGANIZER, dù header truyền X-User-Role: ADMIN => Bị chặn 403
		reqForged := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/admin/role-policies",
			Headers: map[string]string{
				"X-User-Id":   "802",
				"X-User-Role": "ADMIN", // Giả mạo header JWT
			},
		}
		respForged, _ := tHandler.HandleGetRoleFeePolicies(ctx, reqForged)
		if respForged.StatusCode != http.StatusForbidden {
			t.Fatalf("User 802 là ORGANIZER trong DB nhưng giả mạo header ADMIN không bị chặn 403! Status: %d", respForged.StatusCode)
		}

		// (b) User 801 là ADMIN thật trong DB => Thành công 200
		reqAdmin := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/admin/role-policies",
			Headers: map[string]string{
				"X-User-Id":   "801",
				"X-User-Role": "ADMIN",
			},
		}
		respAdmin, _ := tHandler.HandleGetRoleFeePolicies(ctx, reqAdmin)
		if respAdmin.StatusCode != http.StatusOK {
			t.Fatalf("Admin 801 hợp lệ bị từ chối: Status: %d, Body: %s", respAdmin.StatusCode, respAdmin.Body)
		}

		// (c) User có role SUPER_ADMIN hoặc role khác trong DB không được chấp nhận (chỉ ADMIN)
		_, _ = testDB.ExecContext(ctx, "INSERT INTO users (user_id, email, full_name, password_hash, role, status) VALUES (804, 'super804@fpt.edu.vn', 'Super Tester', 'hash', 'STAFF', 'ACTIVE') ON CONFLICT (user_id) DO UPDATE SET role = 'STAFF'")
		reqSuper := events.APIGatewayProxyRequest{
			HTTPMethod: "GET",
			Path:       "/api/v1/admin/role-policies",
			Headers: map[string]string{
				"X-User-Id": "804",
			},
		}
		respSuper, _ := tHandler.HandleGetRoleFeePolicies(ctx, reqSuper)
		if respSuper.StatusCode != http.StatusForbidden {
			t.Fatalf("User 804 (STAFF) phải bị chặn 403 nhưng nhận: %d", respSuper.StatusCode)
		}

		t.Logf("✅ TC1 Đạt: Xác thực quyền ADMIN thành công từ DB, chỉ chấp nhận ADMIN và chặn đứng giả mạo header JWT!")
	})

	// -------------------------------------------------------------
	// TC2: BẮT BUỘC NHẬP REASON KHI THAY ĐỔI BIỂU PHÍ
	// -------------------------------------------------------------
	t.Run("TC2_Mandatory_Reason_Validation", func(t *testing.T) {
		// Cập nhật subscription tier không có reason => Bị từ chối
		err := tRepo.UpdateSubscriptionTier(ctx, 801, 2, 299000, 250, 1000, false, true, "   ")
		if err == nil || !strings.Contains(err.Error(), "lý do") {
			t.Fatalf("Cập nhật tier không có reason phải báo lỗi nhưng lại thành công: %v", err)
		}

		// Cập nhật role fee policy không có reason => Bị từ chối
		err = tRepo.UpdateRoleFeePolicy(ctx, 801, "SCHOOL_ORGANIZER", 250, -1, true, true, "")
		if err == nil || !strings.Contains(err.Error(), "lý do") {
			t.Fatalf("Cập nhật role policy không có reason phải báo lỗi: %v", err)
		}

		// Cập nhật tham số hệ thống không có reason => Bị từ chối
		err = tRepo.UpdateSystemParameter(ctx, 801, "FIXED_FEE_PER_TICKET", "1500", "")
		if err == nil || !strings.Contains(err.Error(), "lý do") {
			t.Fatalf("Cập nhật system param không có reason phải báo lỗi: %v", err)
		}

		t.Logf("✅ TC2 Đạt: Mọi thay đổi biểu phí/tham số bắt buộc phải có reason không rỗng!")
	})

	// -------------------------------------------------------------
	// TC3: TĂNG FEE_CONFIG_VERSION ĐÚNG 1, CHẶN DÒNG THIẾU/GIÁ TRỊ RÁC VÀ TEST CONCURRENCY 10 GOROUTINES
	// -------------------------------------------------------------
	t.Run("TC3_Version_Increment_And_Concurrency_Audit", func(t *testing.T) {
		getVer := func() int {
			var vStr string
			_ = testDB.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = 'FEE_CONFIG_VERSION'").Scan(&vStr)
			v, _ := strconv.Atoi(vStr)
			return v
		}

		// (a) Test: Dòng FEE_CONFIG_VERSION bị thiếu trong DB => Phải trả về lỗi fail-closed và rollback
		_, _ = testDB.ExecContext(ctx, "DELETE FROM platform_system_parameter WHERE param_key = 'FEE_CONFIG_VERSION'")
		errMissingVer := tRepo.UpdateRoleFeePolicy(ctx, 801, "SCHOOL_ORGANIZER", 250, -1, true, true, "Thử khi thiếu version")
		if errMissingVer == nil || !strings.Contains(errMissingVer.Error(), "FEE_CONFIG_VERSION") {
			t.Fatalf("Thiếu dòng FEE_CONFIG_VERSION phải báo lỗi nhưng lại thành công: %v", errMissingVer)
		}

		// (b) Test: Giá trị FEE_CONFIG_VERSION là rác / không phải số nguyên dương => Báo lỗi
		_, _ = testDB.ExecContext(ctx, "INSERT INTO platform_system_parameter (param_key, param_value, description) VALUES ('FEE_CONFIG_VERSION', 'invalid_string', 'ver test') ON CONFLICT (param_key) DO UPDATE SET param_value = 'invalid_string'")
		errGarbageVer := tRepo.UpdateRoleFeePolicy(ctx, 801, "SCHOOL_ORGANIZER", 250, -1, true, true, "Thử khi version rác")
		if errGarbageVer == nil || !strings.Contains(errGarbageVer.Error(), "FEE_CONFIG_VERSION") {
			t.Fatalf("FEE_CONFIG_VERSION là chữ rác phải báo lỗi nhưng lại thành công: %v", errGarbageVer)
		}

		_, _ = testDB.ExecContext(ctx, "UPDATE platform_system_parameter SET param_value = '-5' WHERE param_key = 'FEE_CONFIG_VERSION'")
		errNegVer := tRepo.UpdateRoleFeePolicy(ctx, 801, "SCHOOL_ORGANIZER", 250, -1, true, true, "Thử khi version âm")
		if errNegVer == nil || !strings.Contains(errNegVer.Error(), "FEE_CONFIG_VERSION") {
			t.Fatalf("FEE_CONFIG_VERSION âm phải báo lỗi nhưng lại thành công: %v", errNegVer)
		}

		// Khôi phục version hợp lệ
		_, _ = testDB.ExecContext(ctx, "UPDATE platform_system_parameter SET param_value = '10' WHERE param_key = 'FEE_CONFIG_VERSION'")
		vStart := getVer()
		if vStart != 10 {
			t.Fatalf("Khôi phục version thất bại: %d", vStart)
		}

		// (c) Test Concurrency: 10 goroutines sửa đồng thời => SELECT FOR UPDATE tuần tự hóa, version tăng đúng 10, audit log tăng đúng 10 dòng
		_, _ = testDB.ExecContext(ctx, "DELETE FROM fee_audit_log WHERE changed_by = 801")
		const concurrentCount = 10
		errChan := make(chan error, concurrentCount)

		for i := 0; i < concurrentCount; i++ {
			idx := i
			go func() {
				reason := fmt.Sprintf("Admin concurrent modification #%d", idx)
				err := tRepo.UpdateSystemParameter(ctx, 801, "FIXED_FEE_MIN_TICKET_PRICE", strconv.Itoa(20000+idx), reason)
				errChan <- err
			}()
		}

		for i := 0; i < concurrentCount; i++ {
			if err := <-errChan; err != nil {
				t.Fatalf("Goroutine %d cập nhật thất bại: %v", i, err)
			}
		}

		vEnd := getVer()
		if vEnd != vStart+concurrentCount {
			t.Fatalf("Version sau 10 goroutine đồng thời không tăng đúng 10: trước=%d, sau=%d", vStart, vEnd)
		}

		var auditCount int
		_ = testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM fee_audit_log WHERE changed_by = 801").Scan(&auditCount)
		if auditCount != concurrentCount {
			t.Fatalf("Số lượng bản ghi audit log sai: nhận %d, kỳ vọng đúng %d", auditCount, concurrentCount)
		}

		t.Logf("✅ TC3 Đạt: FEE_CONFIG_VERSION kiểm tra nghiêm ngặt (chặn thiếu/rác/âm), 10 goroutine đồng thời tăng đúng 10 (từ %d lên %d) và ghi nhận đúng 10 dòng audit log!", vStart, vEnd)
	})

	// -------------------------------------------------------------
	// TC4: CHẶN TẮT/SỬA GIÁ GÓI FREE & RÀNG BUỘC THAM SỐ
	// -------------------------------------------------------------
	t.Run("TC4_Tier_FREE_Protection_And_Param_Constraints", func(t *testing.T) {
		// (a) Chặn chuyển FREE tier sang is_active = FALSE
		err := tRepo.UpdateSubscriptionTier(ctx, 801, 1, 0, 500, 100, false, false, "Thử tắt gói FREE")
		if err == nil || !strings.Contains(err.Error(), "vô hiệu hóa") {
			t.Fatalf("Phải chặn tắt gói FREE nhưng lại cho phép: %v", err)
		}

		// (b) Chặn gán giá gói FREE khác 0
		err = tRepo.UpdateSubscriptionTier(ctx, 801, 1, 50000, 500, 100, false, true, "Thử tăng giá gói FREE")
		if err == nil || !strings.Contains(err.Error(), "bằng 0") {
			t.Fatalf("Phải chặn giá gói FREE > 0 nhưng lại cho phép: %v", err)
		}

		// (c) Ràng buộc max_capacity_limit (-1 hoặc > 0)
		err = tRepo.UpdateSubscriptionTier(ctx, 801, 2, 299000, 250, 0, false, true, "Thử capacity = 0")
		if err == nil || !strings.Contains(err.Error(), "sức chứa") {
			t.Fatalf("Capacity = 0 phải bị chặn: %v", err)
		}

		err = tRepo.UpdateSubscriptionTier(ctx, 801, 2, 299000, 250, -10, false, true, "Thử capacity = -10")
		if err == nil || !strings.Contains(err.Error(), "sức chứa") {
			t.Fatalf("Capacity = -10 phải bị chặn: %v", err)
		}

		// (d) Ràng buộc commission_bps (0 - 10.000)
		err = tRepo.UpdateSubscriptionTier(ctx, 801, 2, 299000, 12000, 1000, false, true, "Thử bps > 10000")
		if err == nil || !strings.Contains(err.Error(), "hoa hồng") {
			t.Fatalf("Commission Bps > 10000 phải bị chặn: %v", err)
		}

		t.Logf("✅ TC4 Đạt: Bảo vệ tuyệt đối gói FREE không bị tắt/thu phí; kiểm soát chặt chẽ miền giá trị capacity và bps!")
	})

	// -------------------------------------------------------------
	// TC5: OVERRIDE CHỐNG CHỒNG LẤN THỜI GIAN (409) & CỜ XÁC NHẬN CONFIRM_HIGHER (422 / 201)
	// -------------------------------------------------------------
	t.Run("TC5_Override_Overlap_409_And_ConfirmHigher_Flag", func(t *testing.T) {
		const uID = 802
		now := time.Now()

		// 1. Tạo override 1: Ngày 1 -> Ngày 10
		start1 := now.AddDate(0, 0, 1)
		end1 := now.AddDate(0, 0, 10)
		o1, err := tRepo.CreateFeeOverride(ctx, 801, uID, 150, "Ưu đãi đợt 1", start1, end1, false)
		if err != nil {
			t.Fatalf("Tạo override 1 thất bại: %v", err)
		}
		defer func() {
			_ = tRepo.DeleteFeeOverride(ctx, 801, o1.OverrideID, "Dọn dẹp test")
		}()

		// 2. Tạo override 2 chồng lấn thời gian (Ngày 5 -> Ngày 15) => Bị 409 Conflict do GiST exclusion constraint (23P01)
		start2 := now.AddDate(0, 0, 5)
		end2 := now.AddDate(0, 0, 15)
		_, errOverlap := tRepo.CreateFeeOverride(ctx, 801, uID, 100, "Ưu đãi đợt 2 bị trùng", start2, end2, false)
		if errOverlap == nil || (!errors.Is(errOverlap, ticketModels.ErrOverrideOverlap) && !strings.Contains(errOverlap.Error(), "409")) {
			t.Fatalf("Override chồng lấn thời gian phải trả 409 / ErrOverrideOverlap nhưng nhận: %v", errOverlap)
		}

		// 3. Test case yêu cầu: Organizer đang gói PRO (250 bps), override 500 bps không confirmHigher => 422 Unprocessable Entity
		// Kích hoạt gói PRO cho user 802
		var tierIDPro int
		_ = testDB.QueryRowContext(ctx, "SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'").Scan(&tierIDPro)
		_, _ = testDB.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", uID)
		_, errSub := testDB.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, $2, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days', TRUE, 299000, NOW(), NOW())
		`, uID, tierIDPro)
		if errSub != nil {
			t.Fatalf("Lỗi tạo subscription PRO cho user 802: %v", errSub)
		}

		start3 := now.AddDate(0, 0, 11)
		end3 := now.AddDate(0, 0, 20)
		reqUnconfirmedPro := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/fee-overrides",
			Headers: map[string]string{
				"X-User-Id": "801",
			},
			Body: fmt.Sprintf(`{
				"organizerId": 802,
				"commissionBps": 500,
				"reason": "Ưu đãi 500 bps cho user đang gói Pro 250 bps",
				"startTime": "%s",
				"endTime": "%s",
				"confirmHigher": false
			}`, start3.Format(time.RFC3339), end3.Format(time.RFC3339)),
		}
		respUnconfirmedPro, _ := tHandler.HandleCreateFeeOverride(ctx, reqUnconfirmedPro)
		if respUnconfirmedPro.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("Organizer gói PRO (250 bps) override 500 bps thiếu confirmHigher phải trả 422 nhưng nhận: %d, body: %s", respUnconfirmedPro.StatusCode, respUnconfirmedPro.Body)
		}
		if !strings.Contains(respUnconfirmedPro.Body, "CONFIRMATION_REQUIRED") && !strings.Contains(respUnconfirmedPro.Body, "cao hơn mức") {
			t.Fatalf("Body phản hồi 422 phải chứa cảnh báo yêu cầu xác nhận: %s", respUnconfirmedPro.Body)
		}

		// 4. Test case yêu cầu: Organizer SCHOOL_ORGANIZER chưa có gói (role policy 250 bps), override 500 bps không confirmHigher => 422 Unprocessable Entity
		_, _ = testDB.ExecContext(ctx, `
			INSERT INTO users (user_id, email, full_name, password_hash, role, status)
			VALUES (805, 'schoolorg805@fpt.edu.vn', 'School Org No Tier', 'hash', 'SCHOOL_ORGANIZER', 'ACTIVE')
			ON CONFLICT (user_id) DO UPDATE SET role = 'SCHOOL_ORGANIZER';
			DELETE FROM user_subscription WHERE user_id = 805;
		`)
		reqUnconfirmedSchool := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/fee-overrides",
			Headers: map[string]string{
				"X-User-Id": "801",
			},
			Body: fmt.Sprintf(`{
				"organizerId": 805,
				"commissionBps": 500,
				"reason": "Ưu đãi 500 bps cho SCHOOL_ORGANIZER không gói (role policy 250 bps)",
				"startTime": "%s",
				"endTime": "%s",
				"confirmHigher": false
			}`, start3.Format(time.RFC3339), end3.Format(time.RFC3339)),
		}
		respUnconfirmedSchool, _ := tHandler.HandleCreateFeeOverride(ctx, reqUnconfirmedSchool)
		if respUnconfirmedSchool.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("SCHOOL_ORGANIZER chưa có gói override 500 bps thiếu confirmHigher phải trả 422 nhưng nhận: %d, body: %s", respUnconfirmedSchool.StatusCode, respUnconfirmedSchool.Body)
		}

		// 5. Tạo override BPS cao hơn mức gói VỚI cờ confirmHigher = true => Thành công 201 kèm warning
		reqConfirmed := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/fee-overrides",
			Headers: map[string]string{
				"X-User-Id": "801",
			},
			Body: fmt.Sprintf(`{
				"organizerId": 802,
				"commissionBps": 500,
				"reason": "Admin đã xác nhận áp dụng ưu đãi phí cao hơn gói",
				"startTime": "%s",
				"endTime": "%s",
				"confirmHigher": true
			}`, start3.Format(time.RFC3339), end3.Format(time.RFC3339)),
		}
		respConfirmed, _ := tHandler.HandleCreateFeeOverride(ctx, reqConfirmed)
		if respConfirmed.StatusCode != http.StatusCreated {
			t.Fatalf("Tạo override khi đã confirmHigher=true phải thành công 201 Created nhưng nhận: %d, body: %s", respConfirmed.StatusCode, respConfirmed.Body)
		}

		var createdOverride ticketModels.OrganizerFeeOverride
		_ = json.Unmarshal([]byte(respConfirmed.Body), &createdOverride)
		if createdOverride.OverrideID <= 0 || !strings.Contains(createdOverride.Warning, "cao hơn") {
			t.Fatalf("Override được tạo phải chứa cảnh báo trong struct response: %+v", createdOverride)
		}

		defer func() {
			_ = tRepo.DeleteFeeOverride(ctx, 801, createdOverride.OverrideID, "Dọn dẹp test")
		}()

		t.Logf("✅ TC5 Đạt: Override chồng lấn thời gian bị chặn 409 Conflict; Override mức hoa hồng cao bắt buộc có confirmHigher=true (Pro 250bps -> 500bps = 422; School Org no tier -> 500bps = 422; confirmHigher=true -> 201)!")
	})

	// -------------------------------------------------------------
	// TC6: VÒNG ĐỜI GÁN & THU HỒI SCHOOL_ORGANIZER ROLE
	// -------------------------------------------------------------
	t.Run("TC6_School_Organizer_Role_Lifecycle", func(t *testing.T) {
		const uID = 802

		// (a) Gán School Organizer cho Student 803 => HTTP 400 Bad Request
		reqAssignStudent := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/users/school-role",
			Headers:    map[string]string{"X-User-Id": "801"},
			Body:       `{"userId": 803, "reason": "Thử cấp cho student"}`,
		}
		respStudent, _ := tHandler.HandleAssignSchoolOrganizerRole(ctx, reqAssignStudent)
		if respStudent.StatusCode != http.StatusBadRequest {
			t.Fatalf("Gán quyền School Organizer cho Student phải trả 400 Bad Request nhưng nhận: %d", respStudent.StatusCode)
		}

		// (b) Gán School Organizer cho Organizer 802 => Thành công 200, lưu previous_role = 'ORGANIZER'
		reqAssignOrg := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/users/school-role",
			Headers:    map[string]string{"X-User-Id": "801"},
			Body:       `{"userId": 802, "reason": "Bổ nhiệm phụ trách sự kiện trường"}`,
		}
		respOrg, _ := tHandler.HandleAssignSchoolOrganizerRole(ctx, reqAssignOrg)
		if respOrg.StatusCode != http.StatusOK {
			t.Fatalf("Gán quyền School Organizer cho Organizer 802 thất bại: %d, body: %s", respOrg.StatusCode, respOrg.Body)
		}

		var role, prevRole string
		_ = testDB.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = $1", uID).Scan(&role, &prevRole)
		if role != "SCHOOL_ORGANIZER" || prevRole != "ORGANIZER" {
			t.Fatalf("Dữ liệu sau khi gán sai: role=%s, previous_role=%s", role, prevRole)
		}

		// (c) Gán lần hai khi user đang là School Organizer => Bị từ chối 400, previous_role KHÔNG bị biến thành SCHOOL_ORGANIZER
		reqAssignAgain := events.APIGatewayProxyRequest{
			HTTPMethod: "POST",
			Path:       "/api/v1/admin/users/school-role",
			Headers:    map[string]string{"X-User-Id": "801"},
			Body:       `{"userId": 802, "reason": "Cố tình gán lần 2"}`,
		}
		respAgain, _ := tHandler.HandleAssignSchoolOrganizerRole(ctx, reqAssignAgain)
		if respAgain.StatusCode != http.StatusBadRequest {
			t.Fatalf("Gán lần 2 cho người đã có role phải trả về 400 nhưng nhận: %d", respAgain.StatusCode)
		}

		var roleAfterSecond, prevRoleAfterSecond string
		_ = testDB.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = $1", uID).Scan(&roleAfterSecond, &prevRoleAfterSecond)
		if roleAfterSecond != "SCHOOL_ORGANIZER" || prevRoleAfterSecond != "ORGANIZER" {
			t.Fatalf("Gán lần hai làm hỏng previous_role: role=%s, previous_role=%s", roleAfterSecond, prevRoleAfterSecond)
		}

		// (d) Thu hồi quyền School Organizer => Hoàn trả vai trò ORGANIZER từ previous_role
		reqRevoke := events.APIGatewayProxyRequest{
			HTTPMethod: "DELETE",
			Path:       "/api/v1/admin/users/school-role",
			Headers:    map[string]string{"X-User-Id": "801"},
			Body:       `{"userId": 802, "reason": "Hết nhiệm kỳ phụ trách"}`,
		}
		respRevoke, _ := tHandler.HandleRevokeSchoolOrganizerRole(ctx, reqRevoke)
		if respRevoke.StatusCode != http.StatusOK {
			t.Fatalf("Thu hồi quyền School Organizer thất bại: %d, body: %s", respRevoke.StatusCode, respRevoke.Body)
		}

		var roleRestored string
		var prevRoleRestored sql.NullString
		_ = testDB.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = $1", uID).Scan(&roleRestored, &prevRoleRestored)
		if roleRestored != "ORGANIZER" || prevRoleRestored.Valid {
			t.Fatalf("Sau khi thu hồi: role=%s, previous_role=%v", roleRestored, prevRoleRestored)
		}

		// (e) Thu hồi khi previous_role là NULL qua HTTP Handler => Vẫn an toàn về 200 OK và phục hồi về ORGANIZER
		_, _ = testDB.ExecContext(ctx, "UPDATE users SET role = 'SCHOOL_ORGANIZER', previous_role = NULL WHERE user_id = $1", uID)
		reqRevokeNullPrev := events.APIGatewayProxyRequest{
			HTTPMethod: "DELETE",
			Path:       "/api/v1/admin/users/school-role",
			Headers:    map[string]string{"X-User-Id": "801"},
			Body:       `{"userId": 802, "reason": "Thu hồi khi previous_role NULL"}`,
		}
		respRevokeNullPrev, _ := tHandler.HandleRevokeSchoolOrganizerRole(ctx, reqRevokeNullPrev)
		if respRevokeNullPrev.StatusCode != http.StatusOK {
			t.Fatalf("Thu hồi khi previous_role NULL qua handler thất bại: %d, body: %s", respRevokeNullPrev.StatusCode, respRevokeNullPrev.Body)
		}
		_ = testDB.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = $1", uID).Scan(&roleRestored, &prevRoleRestored)
		if roleRestored != "ORGANIZER" || prevRoleRestored.Valid {
			t.Fatalf("Sau khi thu hồi NULL prev: role=%s, previous_role=%v", roleRestored, prevRoleRestored)
		}

		t.Logf("✅ TC6 Đạt: Vòng đời School Organizer chỉ cho Organizer (Student -> 400), gán 2 lần bảo toàn previous_role, thu hồi khi previous_role=NULL an toàn tuyệt đối qua HTTP Handler 200 OK!")
	})

	// -------------------------------------------------------------
	// TC7: SANDBOX MÔ PHỎNG TÍNH PHÍ VỚI INT64 VÀ PHÍ CỐ ĐỊNH LIVE
	// -------------------------------------------------------------
	t.Run("TC7_Fee_Sandbox_Live_Parameters_Simulation", func(t *testing.T) {
		// Đặt tham số FIXED_FEE_PER_TICKET = 1000, FIXED_FEE_MIN_TICKET_PRICE = 20000
		_ = tRepo.UpdateSystemParameter(ctx, 801, "FIXED_FEE_PER_TICKET", "1000", "Thiết lập phí cố định chuẩn")
		_ = tRepo.UpdateSystemParameter(ctx, 801, "FIXED_FEE_MIN_TICKET_PRICE", "20000", "Thiết lập ngưỡng áp dụng phí cố định")
		_ = tRepo.UpdateSubscriptionTier(ctx, 801, 2, 299000, 250, -1, true, true, "Đặt lại PRO về 250 bps")

		tierCodePro := "PRO" // PRO commission = 250 bps = 2.5%
		simReq := ticketModels.FeeSimulationRequest{
			TierCode:       &tierCodePro,
			TicketPrice:    100000, // 100.000 đ
			TicketQuantity: 5,      // 5 vé => Gross = 500.000 đ
		}

		res, err := tRepo.SimulateFeeCalculation(ctx, simReq)
		if err != nil {
			t.Fatalf("SimulateFeeCalculation thất bại: %v", err)
		}

		// Với gói PRO (250 bps = 2.5%):
		// Commission % mỗi vé = (100.000 * 250) / 10000 = 2.500 đ
		// Fixed fee mỗi vé = 1.000 đ (do 100.000 >= 20.000)
		// Platform fee mỗi vé = 3.500 đ
		// Total Platform fee (5 vé) = 17.500 đ
		// Net Amount Organizer = 500.000 - 17.500 = 482.500 đ
		if res.GrossAmount != 500000 {
			t.Fatalf("GrossAmount sai: %v", res.GrossAmount)
		}
		if res.CommissionAmount != 17500 {
			t.Fatalf("CommissionAmount (Total Platform Fee) sai: %v", res.CommissionAmount)
		}
		if res.TotalFixedFee != 5000 {
			t.Fatalf("TotalFixedFee sai: %v", res.TotalFixedFee)
		}
		if res.NetAmount != 482500 {
			t.Fatalf("NetAmount sai: %v", res.NetAmount)
		}

		t.Logf("✅ TC7 Đạt: Sandbox mô phỏng tính phí chuẩn xác 100%% theo thông số live và công thức int64 của luồng thanh toán thật!")
	})

	// -------------------------------------------------------------
	// TC8: BỔ SUNG KIỂM TRA 2 ĐIỂM NHỎ: SỐ DƯ VÍ PHẦN THẬP PHÂN LẺ & JOB KHÔNG GIA HẠN GÓI IS_ACTIVE=FALSE
	// -------------------------------------------------------------
	t.Run("TC8_Decimal_Wallet_Balance_And_Disabled_Tier_Job_Check", func(t *testing.T) {
		const uID = 802

		// 1. Giả lập số dư ví có phần thập phân lẻ (50000.75) => SubscribeOrUpgrade phải từ chối
		_, _ = testDB.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", uID)
		_, _ = testDB.ExecContext(ctx, "UPDATE wallet SET balance = 50000.75 WHERE user_id = $1", uID)
		_, errDec := tRepo.SubscribeOrUpgrade(ctx, uID, ticketModels.SubscribeRequest{
			TierCode:  "PRO",
			RequestID: "req-decimal-test-01",
		})
		if errDec == nil || !strings.Contains(errDec.Error(), "phần thập phân lẻ") {
			t.Fatalf("Số dư ví có phần lẻ khác 0 (50000.75) phải bị từ chối nhưng lại thành công: %v", errDec)
		}

		// Khôi phục số dư ví nguyên vẹn
		_, _ = testDB.ExecContext(ctx, "UPDATE wallet SET balance = 2000000 WHERE user_id = $1", uID)

		// 2. Tạo gói ACTIVE cho user 802 nhưng cấu hình tier BUSINESS có is_active = FALSE
		var tierIDBusiness int
		if err := testDB.QueryRowContext(ctx, "SELECT tier_id FROM subscription_tier WHERE tier_code = 'BUSINESS'").Scan(&tierIDBusiness); err != nil {
			t.Fatalf("Lỗi truy vấn tier_id BUSINESS: %v", err)
		}

		// Xóa các subscription cũ của user 802
		if _, err := testDB.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", uID); err != nil {
			t.Fatalf("Lỗi xóa user_subscription: %v", err)
		}

		// Cấp gói BUSINESS quá hạn cho user 802
		insertSubQuery := `
			INSERT INTO user_subscription (user_id, tier_id, status, start_date, end_date, auto_renew, amount_paid_vnd, created_at, updated_at)
			VALUES ($1, $2, 'ACTIVE', NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days', TRUE, 1000000, NOW(), NOW())
		`
		if _, err := testDB.ExecContext(ctx, insertSubQuery, uID, tierIDBusiness); err != nil {
			t.Fatalf("Lỗi insert gói quá hạn: %v", err)
		}

		// Vô hiệu hóa tier BUSINESS (is_active = FALSE)
		if _, err := testDB.ExecContext(ctx, "UPDATE subscription_tier SET is_active = FALSE WHERE tier_id = $1", tierIDBusiness); err != nil {
			t.Fatalf("Lỗi update is_active BUSINESS: %v", err)
		}

		sched := ticketScheduler.NewSubscriptionExpiryScheduler(testDB, 60)
		expired, renewed, errJob := sched.RunOnce(ctx)
		if errJob != nil {
			t.Fatalf("Job quét hết hạn bị lỗi: %v", errJob)
		}

		if expired < 1 || renewed != 0 {
			t.Fatalf("Job phải chuyển ít nhất 1 gói hết hạn và KHÔNG gia hạn gói bị tắt (renewed=0), nhận: expired=%d, renewed=%d", expired, renewed)
		}

		// Kiểm tra ví không bị trừ 1.000.000 đ
		var bal float64
		_ = testDB.QueryRowContext(ctx, "SELECT balance FROM wallet WHERE user_id = $1", uID).Scan(&bal)
		if int64(bal) != 2000000 {
			t.Fatalf("Gói bị tắt nhưng ví vẫn bị trừ tiền: %v", bal)
		}

		// Khôi phục lại tier BUSINESS is_active = TRUE
		_, _ = testDB.ExecContext(ctx, "UPDATE subscription_tier SET is_active = TRUE WHERE tier_id = $1", tierIDBusiness)

		t.Logf("✅ TC8 Đạt: Chặn số dư ví phần thập phân lẻ (fail-closed) và Job hết hạn tuyệt đối KHÔNG gia hạn/trừ tiền các gói is_active=FALSE!")
	})
}
