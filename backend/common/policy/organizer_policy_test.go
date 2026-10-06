package policy_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/fpt-event-services/common/policy"
	_ "github.com/lib/pq"
)

func getTestDB(t *testing.T) *sql.DB {
	connStr := "postgres://postgres:postgres@127.0.0.1:5432/fpt_event_test?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Skipf("⏭️ [CI SKIP] Không thể kết nối DB local (%v). Bỏ qua test.", err)
		return nil
	}
	if err := db.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] DB Ping thất bại (%v). Bỏ qua test trong môi trường CI.", err)
		return nil
	}
	return db
}

// TestResolveOrganizerPolicy_UnitCases kiểm tra toàn diện các quy tắc của ResolveOrganizerPolicy:
// 1. Role SCHOOL_ORGANIZER thiếu role_fee_policy => Error fail-closed
// 2. Thiếu dòng FREE trong subscription_tier => Error fail-closed
// 3. Override 0% không làm đổi sức chứa (MaxCapacityLimit) hay báo cáo nâng cao (HasAdvancedReports)
// 4. Kết hợp Role + Gói => Min hoa hồng, Hợp quyền lợi (capacity = -1 hoặc max, reports = or)
func TestResolveOrganizerPolicy_UnitCases(t *testing.T) {
	db := getTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()
	ctx := context.Background()

	_, _ = db.ExecContext(ctx, `
		UPDATE subscription_tier SET price_vnd = 0, commission_bps = 500, max_capacity_limit = 100, has_advanced_reports = FALSE, is_active = TRUE WHERE tier_code = 'FREE';
		UPDATE subscription_tier SET price_vnd = 299000, commission_bps = 250, max_capacity_limit = -1, has_advanced_reports = TRUE, is_active = TRUE WHERE tier_code = 'PRO';
		UPDATE subscription_tier SET price_vnd = 1000000, commission_bps = 0, max_capacity_limit = -1, has_advanced_reports = TRUE, is_active = TRUE WHERE tier_code = 'BUSINESS';
	`)

	// 1. TEST CASE 1: Role SCHOOL_ORGANIZER thiếu cấu hình role_fee_policy => Báo lỗi fail-closed
	t.Run("SchoolOrganizer_Missing_RoleFeePolicy_ReturnsError", func(t *testing.T) {
		const testUID = 901
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (user_id, email, full_name, password_hash, role, status)
			VALUES ($1, 'school.missing@fpt.edu.vn', 'School Missing', 'hash', 'SCHOOL_ORGANIZER', 'ACTIVE')
			ON CONFLICT (user_id) DO UPDATE SET role = 'SCHOOL_ORGANIZER'
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi tạo user 901: %v", err)
		}
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE organizer_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "UPDATE role_fee_policy SET is_active = FALSE WHERE role_code = 'SCHOOL_ORGANIZER'")
		defer func() {
			_, _ = db.ExecContext(ctx, "UPDATE role_fee_policy SET is_active = TRUE WHERE role_code = 'SCHOOL_ORGANIZER'")
		}()

		p, err := policy.ResolveOrganizerPolicy(ctx, db, testUID)
		if err == nil {
			t.Fatalf("Kỳ vọng trả lỗi khi thiếu role_fee_policy active, nhưng nhận: %+v", p)
		}
		if !strings.Contains(err.Error(), "FAIL-CLOSED") {
			t.Fatalf("Kỳ vọng lỗi chứa FAIL-CLOSED, nhận: %v", err)
		}
		t.Logf("✅ Đạt kỳ vọng: SCHOOL_ORGANIZER thiếu role_fee_policy trả lỗi fail-closed: %v", err)
	})

	// 2. TEST CASE 2: Thiếu dòng FREE trong subscription_tier => Báo lỗi fail-closed
	t.Run("Missing_FreeTier_ReturnsError", func(t *testing.T) {
		const testUID = 902
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (user_id, email, full_name, password_hash, role, status)
			VALUES ($1, 'free.missing@fpt.edu.vn', 'Free Missing', 'hash', 'ORGANIZER', 'ACTIVE')
			ON CONFLICT (user_id) DO UPDATE SET role = 'ORGANIZER'
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi tạo user 902: %v", err)
		}
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE organizer_id = $1", testUID)

		// Tạm thời vô hiệu hóa FREE tier trong DB trong transaction rollback
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatalf("Lỗi begin tx: %v", err)
		}
		defer tx.Rollback()

		_, err = tx.ExecContext(ctx, `UPDATE subscription_tier SET tier_code = 'FREE_TMP' WHERE tier_code = 'FREE'`)
		if err != nil {
			t.Fatalf("Lỗi update tier_code: %v", err)
		}

		p, err := policy.ResolveOrganizerPolicy(ctx, tx, testUID)
		if err == nil {
			t.Fatalf("Kỳ vọng trả lỗi khi thiếu gói FREE, nhưng nhận: %+v", p)
		}
		if !strings.Contains(err.Error(), "FAIL-CLOSED") {
			t.Fatalf("Kỳ vọng lỗi chứa FAIL-CLOSED, nhận: %v", err)
		}
		t.Logf("✅ Đạt kỳ vọng: Thiếu gói FREE trong DB trả lỗi fail-closed: %v", err)
	})

	// 3. TEST CASE 3: Override 0% KHÔNG làm đổi sức chứa hay quyền báo cáo
	t.Run("FeeOverride_DoesNotAlter_Capacity_Or_Reports", func(t *testing.T) {
		const testUID = 903
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (user_id, email, full_name, password_hash, role, status)
			VALUES ($1, 'override.test@fpt.edu.vn', 'Override Test', 'hash', 'ORGANIZER', 'ACTIVE')
			ON CONFLICT (user_id) DO UPDATE SET role = 'ORGANIZER'
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi tạo user 903: %v", err)
		}
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE organizer_id = $1", testUID)
		_, err = db.ExecContext(ctx, `
			INSERT INTO organizer_fee_override (organizer_id, commission_bps, effective_range, reason, created_by)
			VALUES ($1, 0, tstzrange(NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', '[]'), 'Vip 0% override', 1)
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi chèn override: %v", err)
		}

		p, err := policy.ResolveOrganizerPolicy(ctx, db, testUID)
		if err != nil {
			t.Fatalf("Lỗi ResolveOrganizerPolicy: %v", err)
		}
		if p.CommissionBps != 0 || p.FeeSource != "OVERRIDE" {
			t.Fatalf("Kỳ vọng hoa hồng 0 bps và FeeSource=OVERRIDE, nhận: %d (%s)", p.CommissionBps, p.FeeSource)
		}
		// Sức chứa của Free vẫn phải là 100, và không có quyền báo cáo nâng cao
		if p.MaxCapacityLimit != 100 {
			t.Fatalf("Kỳ vọng MaxCapacityLimit giữ nguyên 100 của FREE, nhận: %d", p.MaxCapacityLimit)
		}
		if p.HasAdvancedReports != false {
			t.Fatalf("Kỳ vọng HasAdvancedReports giữ nguyên false của FREE, nhận: %v", p.HasAdvancedReports)
		}
		t.Logf("✅ Đạt kỳ vọng: Override 0%% cập nhật CommissionBps=0 nhưng giữ nguyên MaxCapacityLimit=%d, HasAdvancedReports=%v",
			p.MaxCapacityLimit, p.HasAdvancedReports)
	})

	// 4. TEST CASE 4: Role SCHOOL_ORGANIZER + Gói PRO => Min hoa hồng, Hợp quyền lợi
	t.Run("SchoolOrganizer_Plus_ActiveTier_Union_Privileges", func(t *testing.T) {
		const testUID = 904
		_, err := db.ExecContext(ctx, `
			INSERT INTO users (user_id, email, full_name, password_hash, role, status)
			VALUES ($1, 'school.pro@fpt.edu.vn', 'School Pro', 'hash', 'SCHOOL_ORGANIZER', 'ACTIVE')
			ON CONFLICT (user_id) DO UPDATE SET role = 'SCHOOL_ORGANIZER'
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi tạo user 904: %v", err)
		}
		_, _ = db.ExecContext(ctx, "DELETE FROM user_subscription WHERE user_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE organizer_id = $1", testUID)
		_, _ = db.ExecContext(ctx, "UPDATE role_fee_policy SET is_active = TRUE, commission_bps = 100, max_capacity_limit = 500, has_advanced_reports = FALSE WHERE role_code = 'SCHOOL_ORGANIZER'")
		_, err = db.ExecContext(ctx, `
			INSERT INTO user_subscription (user_id, tier_id, start_date, end_date, status)
			VALUES ($1, (SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'), NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', 'ACTIVE')
		`, testUID)
		if err != nil {
			t.Fatalf("Lỗi chèn subscription PRO: %v", err)
		}

		defer func() {
			_, _ = db.ExecContext(ctx, "UPDATE role_fee_policy SET is_active = TRUE, commission_bps = 0, max_capacity_limit = -1, has_advanced_reports = TRUE WHERE role_code = 'SCHOOL_ORGANIZER'")
		}()

		p, err := policy.ResolveOrganizerPolicy(ctx, db, testUID)
		if err != nil {
			t.Fatalf("Lỗi ResolveOrganizerPolicy: %v", err)
		}

		// Role: 100 bps vs Pro: 250 bps => Min = 100 bps (từ Role)
		if p.CommissionBps != 100 || p.FeeSource != "ROLE" {
			t.Fatalf("Kỳ vọng hoa hồng min 100 bps từ ROLE, nhận: %d (%s)", p.CommissionBps, p.FeeSource)
		}
		// Sức chứa: Role 500 vs Pro -1 => Max/Union = -1 (Không giới hạn)
		if p.MaxCapacityLimit != -1 {
			t.Fatalf("Kỳ vọng MaxCapacityLimit = -1 (hợp quyền lợi), nhận: %d", p.MaxCapacityLimit)
		}
		// Báo cáo nâng cao: Role false || Pro true => true
		if !p.HasAdvancedReports {
			t.Fatalf("Kỳ vọng HasAdvancedReports = true (hợp quyền lợi), nhận: false")
		}
		t.Logf("✅ Đạt kỳ vọng: Role (100bps, 500cap, false rep) + Pro (250bps, -1cap, true rep) => Min hoa hồng: %d (%s), Hợp sức chứa: %d, Hợp báo cáo: %v",
			p.CommissionBps, p.FeeSource, p.MaxCapacityLimit, p.HasAdvancedReports)
	})
}
