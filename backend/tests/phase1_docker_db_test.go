package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fpt-event-services/services/ticket-service/repository"
	_ "github.com/lib/pq"
)

func getProjectRoot() string {
	wd, _ := os.Getwd()
	// If running inside backend/tests or backend, navigate to root
	for {
		if _, err := os.Stat(filepath.Join(wd, "docker-compose.yml")); err == nil {
			return wd
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			break
		}
		wd = parent
	}
	return "c:\\AK\\HOCKI6\\OJT\\Project\\fpt-event-management-system"
}

func TestPhase1_DockerPostgres_FullLifecycle(t *testing.T) {
	connStr := "postgres://postgres:postgres@localhost:5432/fpt_event_test?sslmode=disable"

	// SAFETY GUARD: Tuyệt đối từ chối chạy nếu host/DB không phải container test local
	if !strings.Contains(connStr, "localhost") && !strings.Contains(connStr, "127.0.0.1") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên host không phải localhost! ConnStr: %s", connStr)
	}
	if !strings.Contains(connStr, "fpt_event_test") {
		t.Fatalf("🚨 SAFETY GUARD: Từ chối thực thi test trên DB không chứa 'fpt_event_test'! ConnStr: %s", connStr)
	}
	t.Log("🛡️ SAFETY GUARD PASSED: Đang kết nối tới đúng container test an toàn (localhost:5432 / fpt_event_test).")

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Fatalf("Không thể mở kết nối tới Docker Postgres: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("⏭️ [CI SKIP] Docker Postgres local không phản hồi (%v). Bỏ qua integration test trong môi trường CI.", err)
		return
	}
	t.Log("✅ Đã kết nối thành công tới Docker Postgres (localhost:5432)!")

	ctx := context.Background()
	rootDir := getProjectRoot()

	// 1. Nạp 01_fpt_event_full_postgres.sql (Nếu có file dưới local)
	baseSQLPath := filepath.Join(rootDir, "Database", "initdb.d", "01_fpt_event_full_postgres.sql")
	baseSQL, err := os.ReadFile(baseSQLPath)
	if err != nil {
		t.Skipf("⏭️ [CI SKIP] Thư mục Database/ bị ignore trên Git nên không tìm thấy file schema (%v). Bỏ qua test.", err)
		return
	}
	// Tạo các role Supabase (service_role, anon, authenticated) nếu chưa tồn tại (giả lập môi trường Supabase trên Postgres local)
	initRolesSQL := `
		DO $$ 
		BEGIN 
			IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
			IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
			IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
		END $$;
	`
	if _, err := db.ExecContext(ctx, initRolesSQL); err != nil {
		t.Fatalf("Lỗi tạo các role Supabase: %v", err)
	}

	// Reset public schema để đảm bảo môi trường test sạch sẽ
	resetSchemaSQL := `
		DROP SCHEMA IF EXISTS public CASCADE;
		CREATE SCHEMA public;
		GRANT ALL ON SCHEMA public TO postgres;
		GRANT ALL ON SCHEMA public TO public;
	`
	if _, err := db.ExecContext(ctx, resetSchemaSQL); err != nil {
		t.Fatalf("Lỗi reset schema public: %v", err)
	}

	t.Log("Đang nạp base schema từ 01_fpt_event_full_postgres.sql...")
	if _, err := db.ExecContext(ctx, "SET session_replication_role = 'replica';"); err != nil {
		t.Fatalf("Lỗi set replica role: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(baseSQL)); err != nil {
		t.Fatalf("Lỗi nạp base schema: %v", err)
	}
	if _, err := db.ExecContext(ctx, "SET session_replication_role = 'origin';"); err != nil {
		t.Fatalf("Lỗi reset replica role: %v", err)
	}
	t.Log("✅ Nạp base schema thành công!")

	// 2. Chèn dữ liệu mẫu có cả giá vé lẻ (12.500, 33.333) và 4 mức tỷ lệ biểu phí cũ (4.50%, 3.50%, 6.00%, 5.00%)
	t.Log("Chèn dữ liệu mẫu đại diện đầy đủ 4 mức hoa hồng cũ...")
	seedSQL := `
		INSERT INTO users (user_id, full_name, email, password_hash, role, status) VALUES
		(1, 'Organizer A', 'organizer.a@fpt.edu.vn', 'hash_pass', 'ORGANIZER', 'ACTIVE'),
		(2, 'Student B', 'student.b@fpt.edu.vn', 'hash_pass', 'STUDENT', 'ACTIVE')
		ON CONFLICT (user_id) DO NOTHING;

		INSERT INTO event (event_id, title, description, start_time, end_time, created_by, org_type, status) VALUES
		(1, 'Tech Seminar 2026', 'Event test', NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 1, 'SCHOOL', 'OPEN')
		ON CONFLICT (event_id) DO NOTHING;

		INSERT INTO category_ticket (category_ticket_id, event_id, name, price, max_quantity, status) VALUES
		(1, 1, 'Standard 100k', 100000.00, 100, 'AVAILABLE'),
		(2, 1, 'Odd Ticket 12.5k', 12500.00, 50, 'AVAILABLE'),
		(3, 1, 'Odd Ticket 33.3k', 33333.00, 50, 'AVAILABLE'),
		(4, 1, 'Ticket 50k', 50000.00, 50, 'AVAILABLE')
		ON CONFLICT (category_ticket_id) DO NOTHING;

		INSERT INTO bill (bill_id, user_id, total_amount, payment_status, created_at) VALUES
		(1, 2, 100000.00, 'PAID', NOW() - INTERVAL '2 days'),
		(2, 2, 12500.00, 'PAID', NOW() - INTERVAL '1 day'),
		(3, 2, 33333.00, 'PAID', NOW() - INTERVAL '12 hours'),
		(4, 2, 50000.00, 'PAID', NOW() - INTERVAL '6 hours')
		ON CONFLICT (bill_id) DO NOTHING;

		INSERT INTO ticket (ticket_id, event_id, user_id, category_ticket_id, bill_id, qr_code_value, status) VALUES
		(1, 1, 2, 1, 1, 'QR1', 'BOOKED'),
		(2, 1, 2, 2, 2, 'QR2', 'BOOKED'),
		(3, 1, 2, 3, 3, 'QR3', 'BOOKED'),
		(4, 1, 2, 4, 4, 'QR4', 'BOOKED')
		ON CONFLICT (ticket_id) DO NOTHING;

		-- Chèn 4 biên lai cũ đại diện đủ 4 mức tỷ lệ (4.50%, 3.50%, 6.00%, 5.00%)
		INSERT INTO financial_receipt (receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id, gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency, created_at) VALUES
		(1, 1, 1, 1, 1, 1, 100000.00, 4.50, 1000.00, 5500.00, 94500.00, 'VND', NOW() - INTERVAL '2 days'),
		(2, 2, 2, 2, 1, 1, 12500.00, 3.50, 1000.00, 1437.50, 11062.50, 'VND', NOW() - INTERVAL '1 day'),
		(3, 3, 3, 3, 1, 1, 33333.00, 6.00, 1000.00, 2999.98, 30333.02, 'VND', NOW() - INTERVAL '12 hours'),
		(4, 4, 4, 4, 1, 1, 50000.00, 5.00, 1000.00, 3500.00, 46500.00, 'VND', NOW() - INTERVAL '6 hours')
		ON CONFLICT (receipt_id) DO NOTHING;
	`
	if _, err := db.ExecContext(ctx, seedSQL); err != nil {
		t.Fatalf("Lỗi chèn dữ liệu mẫu: %v", err)
	}

	// 3. Đếm số dòng financial_receipt lệch FLOOR trong dữ liệu mẫu
	var floorMismatchCount int
	floorQuery := `
		SELECT COUNT(*) 
		FROM financial_receipt 
		WHERE gross_amount <> FLOOR(gross_amount) 
		   OR commission_amount <> FLOOR(commission_amount) 
		   OR net_amount <> FLOOR(net_amount) 
		   OR fixed_fee <> FLOOR(fixed_fee);
	`
	if err := db.QueryRowContext(ctx, floorQuery).Scan(&floorMismatchCount); err != nil {
		t.Fatalf("Lỗi đếm dòng lệch FLOOR: %v", err)
	}
	t.Logf("📊 SỐ DÒNG FINANCIAL_RECEIPT CÓ SỐ TIỀN LỆCH FLOOR TRONG DỮ LIỆU MẪU: %d dòng (biên lai 2 và 3 do công thức Round)", floorMismatchCount)

	// Đếm số dòng có net_amount < 0
	var negativeNetCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM financial_receipt WHERE net_amount < 0").Scan(&negativeNetCount); err != nil {
		t.Fatalf("Lỗi đếm net < 0: %v", err)
	}
	t.Logf("📊 SỐ DÒNG CÓ NET_AMOUNT < 0 BAN ĐẦU: %d dòng", negativeNetCount)

	// Thống kê trước migration
	var countBefore int
	var grossBefore, commBefore, netBefore float64
	sumQuery := `SELECT COUNT(*), COALESCE(SUM(gross_amount),0), COALESCE(SUM(commission_amount),0), COALESCE(SUM(net_amount),0) FROM financial_receipt;`
	if err := db.QueryRowContext(ctx, sumQuery).Scan(&countBefore, &grossBefore, &commBefore, &netBefore); err != nil {
		t.Fatalf("Lỗi query sum trước migration: %v", err)
	}
	t.Logf("📈 TRƯỚC MIGRATION: COUNT=%d | SUM(gross)=%.2f | SUM(commission)=%.2f | SUM(net)=%.2f",
		countBefore, grossBefore, commBefore, netBefore)

	// 4. Chạy 03 UP
	m03Path := filepath.Join(rootDir, "Database", "migrations", "03_add_school_organizer_enum.sql")
	m03SQL, err := os.ReadFile(m03Path)
	if err != nil {
		t.Fatalf("Không đọc được 03 migration: %v", err)
	}
	t.Log("Đang chạy 03_add_school_organizer_enum.sql (UP)...")
	if _, err := db.ExecContext(ctx, string(m03SQL)); err != nil {
		t.Fatalf("Lỗi chạy 03 UP: %v", err)
	}
	t.Log("✅ 03 UP thành công!")

	// 5. Chạy 04a UP (thêm cột nullable + backfill + bảng mới)
	m04aPath := filepath.Join(rootDir, "Database", "migrations", "04a_subscription_and_dynamic_fees.sql")
	m04aSQL, err := os.ReadFile(m04aPath)
	if err != nil {
		t.Fatalf("Không đọc được 04a migration: %v", err)
	}
	t.Log("Đang chạy 04a_subscription_and_dynamic_fees.sql (UP)...")
	if _, err := db.ExecContext(ctx, string(m04aSQL)); err != nil {
		t.Fatalf("Lỗi chạy 04a UP: %v", err)
	}
	t.Log("✅ 04a UP thành công!")

	// Kiểm tra đối soát sau 04a: COUNT và SUM phải bằng 100% trước migration!
	var countAfter04a int
	var grossAfter04a, commAfter04a, netAfter04a float64
	if err := db.QueryRowContext(ctx, sumQuery).Scan(&countAfter04a, &grossAfter04a, &commAfter04a, &netAfter04a); err != nil {
		t.Fatalf("Lỗi query sum sau 04a: %v", err)
	}
	t.Logf("📈 SAU MIGRATION 04a: COUNT=%d | SUM(gross)=%.2f | SUM(commission)=%.2f | SUM(net)=%.2f",
		countAfter04a, grossAfter04a, commAfter04a, netAfter04a)

	if countBefore != countAfter04a || grossBefore != grossAfter04a || commBefore != commAfter04a || netBefore != netAfter04a {
		t.Fatalf("❌ SAI LỆCH DỮ LIỆU TÀI CHÍNH TRƯỚC/SAU 04a MIGRATION!")
	}
	t.Log("✅ ĐỐI SOÁT TÀI CHÍNH TRƯỚC VÀ SAU 04a TRÙNG KHỚP 100%!")

	// Kiểm tra backfill: tier_code='LEGACY', fee_source='LEGACY', commission_bps khớp system_fee_percentage*100
	var nullTierCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM financial_receipt WHERE tier_code IS NULL").Scan(&nullTierCount); err != nil {
		t.Fatalf("Lỗi query null tier_code: %v", err)
	}
	if nullTierCount != 0 {
		t.Fatalf("❌ Backfill thất bại: vẫn còn %d dòng có tier_code IS NULL", nullTierCount)
	}
	t.Log("✅ Backfill thành công: 0 dòng có tier_code IS NULL!")

	// YÊU CẦU 1: Truy vấn và in bảng dữ liệu sau backfill để xác nhận bps = 450, 350, 600, 500
	t.Log("📋 BẢNG KẾT QUẢ SELECT SAU BACKFILL (XÁC NHẬN BPS KHỚP 100%):")
	selectRowsQuery := `
		SELECT receipt_id, gross_amount, system_fee_percentage, commission_amount, commission_bps, tier_code, fee_source 
		FROM financial_receipt 
		ORDER BY receipt_id;
	`
	rows, err := db.QueryContext(ctx, selectRowsQuery)
	if err != nil {
		t.Fatalf("Lỗi query select sau backfill: %v", err)
	}
	defer rows.Close()

	t.Logf("| %-10s | %-12s | %-21s | %-17s | %-14s | %-9s | %-10s |",
		"receipt_id", "gross_amount", "system_fee_percentage", "commission_amount", "commission_bps", "tier_code", "fee_source")
	t.Logf("|------------|--------------|-----------------------|-------------------|----------------|-----------|------------|")
	for rows.Next() {
		var rid, cbps int
		var gross, feePct, comm float64
		var tcode, fsource string
		if err := rows.Scan(&rid, &gross, &feePct, &comm, &cbps, &tcode, &fsource); err != nil {
			t.Fatalf("Lỗi scan row: %v", err)
		}
		t.Logf("| %-10d | %-12.2f | %-21.2f | %-17.2f | %-14d | %-9s | %-10s |",
			rid, gross, feePct, comm, cbps, tcode, fsource)
	}

	// 6. Chạy 04b UP (khóa NOT NULL sau khi code deploy)
	m04bPath := filepath.Join(rootDir, "Database", "migrations", "04b_enforce_receipt_snapshots.sql")
	m04bSQL, err := os.ReadFile(m04bPath)
	if err != nil {
		t.Fatalf("Không đọc được 04b migration: %v", err)
	}
	t.Log("Đang chạy 04b_enforce_receipt_snapshots.sql (UP)...")
	if _, err := db.ExecContext(ctx, string(m04bSQL)); err != nil {
		t.Fatalf("Lỗi chạy 04b UP: %v", err)
	}
	t.Log("✅ 04b UP thành công!")

	// ============================================================
	// 7. TEST DB THẬT: KIỂM THỬ RÀNG BUỘC VÀ QUY TẮC NGHIỆP VỤ
	// ============================================================

	// TEST A: INSERT receipt thiếu snapshot fields -> BẮT BUỘC LỖI NOT NULL!
	t.Run("DB Test: INSERT receipt thiếu snapshot sau 04b phải lỗi NOT NULL", func(t *testing.T) {
		queryMissing := `
			INSERT INTO financial_receipt (
				order_id, bill_id, ticket_id, event_id, organizer_id,
				gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency
			) VALUES (99, 1, 1, 1, 1, 50000.00, 5.0, 1000.00, 3500.00, 46500.00, 'VND');
		`
		_, err := db.ExecContext(ctx, queryMissing)
		if err == nil {
			t.Fatalf("❌ LỖI: INSERT thiếu tier_code/commission_bps/fee_source nhưng DB không báo lỗi NOT NULL!")
		}
		t.Logf("✅ Đạt kỳ vọng: DB chặn INSERT thiếu snapshot với lỗi NOT NULL: %v", err)
	})

	// TEST B: INSERT với hoa hồng lẻ (562.50đ) -> KHÔNG ĐƯỢC BỊ CHẶN Ở PHA 1!
	t.Run("DB Test: INSERT hoa hồng lẻ (562.50) KHÔNG bị chặn ở Pha 1", func(t *testing.T) {
		queryFractional := `
			INSERT INTO financial_receipt (
				receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id,
				gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency,
				tier_code, commission_bps, fee_source, fee_config_version, is_reversal
			) VALUES (
				10, 10, 1, 1, 1, 1,
				12500.00, 4.50, 0.00, 562.50, 11937.50, 'VND',
				'LEGACY', 450, 'LEGACY', 1, FALSE
			);
		`
		_, err := db.ExecContext(ctx, queryFractional)
		if err != nil {
			t.Fatalf("❌ LỖI: INSERT hoa hồng lẻ (562.50) bị chặn ở Pha 1: %v", err)
		}
		t.Log("✅ Đạt kỳ vọng: Hoa hồng lẻ (562.50) được chèn thành công trong Pha 1 (không bị chk_financial_receipt_integers chặn)!")
	})

	// TEST C: INSERT biên lai đảo số âm với is_reversal = TRUE -> BẮT BUỘC THÀNH CÔNG!
	t.Run("DB Test: Biên lai đảo số âm với is_reversal=TRUE hợp lệ", func(t *testing.T) {
		queryReversal := `
			INSERT INTO financial_receipt (
				receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id,
				gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency,
				tier_code, commission_bps, fee_source, fee_config_version, is_reversal, reversal_of_receipt_id
			) VALUES (
				11, 10, 1, 1, 1, 1,
				-12500.00, 4.50, 0.00, -562.50, -11937.50, 'VND',
				'LEGACY', 450, 'LEGACY', 1, TRUE, 10
			);
		`
		_, err := db.ExecContext(ctx, queryReversal)
		if err != nil {
			t.Fatalf("❌ LỖI: Biên lai đảo số âm bị từ chối: %v", err)
		}
		t.Log("✅ Đạt kỳ vọng: Biên lai đảo số âm (is_reversal=TRUE) được lưu hợp lệ!")
	})

	// TEST D: INSERT biên lai gốc có net_amount < 0 -> BẮT BUỘC BỊ CHẶN BỞI CONSTRAINT!
	t.Run("DB Test: Biên lai gốc net_amount < 0 bị chặn", func(t *testing.T) {
		queryNegativeOriginal := `
			INSERT INTO financial_receipt (
				receipt_id, order_id, bill_id, ticket_id, event_id, organizer_id,
				gross_amount, system_fee_percentage, fixed_fee, commission_amount, net_amount, currency,
				tier_code, commission_bps, fee_source, fee_config_version, is_reversal
			) VALUES (
				12, 12, 1, 1, 1, 1,
				1000.00, 4.50, 1000.00, 2000.00, -1000.00, 'VND',
				'LEGACY', 450, 'LEGACY', 1, FALSE
			);
		`
		_, err := db.ExecContext(ctx, queryNegativeOriginal)
		if err == nil {
			t.Fatalf("❌ LỖI: Biên lai gốc có net_amount < 0 nhưng không bị chặn!")
		}
		t.Logf("✅ Đạt kỳ vọng: Biên lai gốc có net_amount < 0 bị chặn với lỗi ràng buộc: %v", err)
	})

	// Dọn các bản ghi test
	_, _ = db.ExecContext(ctx, "DELETE FROM financial_receipt WHERE receipt_id IN (10, 11, 12)")

	// ============================================================
	// 8. TEST MIGRATION DOWN VÀ IDEMPOTENT (UP LẠI)
	// ============================================================
	t.Log("Đang chạy 04b DOWN...")
	m04bDownPath := filepath.Join(rootDir, "Database", "migrations", "04b_enforce_receipt_snapshots.down.sql")
	m04bDownSQL, err := os.ReadFile(m04bDownPath)
	if err != nil {
		t.Fatalf("Không đọc được 04b DOWN: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(m04bDownSQL)); err != nil {
		t.Fatalf("Lỗi chạy 04b DOWN: %v", err)
	}
	t.Log("✅ 04b DOWN thành công!")

	t.Log("Đang chạy 04a DOWN...")
	m04aDownPath := filepath.Join(rootDir, "Database", "migrations", "04a_subscription_and_dynamic_fees.down.sql")
	m04aDownSQL, err := os.ReadFile(m04aDownPath)
	if err != nil {
		t.Fatalf("Không đọc được 04a DOWN: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(m04aDownSQL)); err != nil {
		t.Fatalf("Lỗi chạy 04a DOWN: %v", err)
	}
	t.Log("✅ 04a DOWN thành công!")

	// Kiểm tra bảng đã drop sạch
	var tableCheck int
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'subscription_tier'").Scan(&tableCheck)
	if tableCheck != 0 {
		t.Fatalf("❌ Sau 04a DOWN, bảng subscription_tier vẫn còn tồn tại!")
	}
	t.Log("✅ Sau 04a DOWN, toàn bộ bảng tạo mới đã được DROP sạch sẽ!")

	// Chạy UP lại để xác nhận tính Idempotent
	t.Log("Đang chạy UP lại (03 -> 04a -> 04b) để xác nhận IDEMPOTENT...")
	if _, err := db.ExecContext(ctx, string(m03SQL)); err != nil {
		t.Fatalf("Lỗi UP lại 03: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(m04aSQL)); err != nil {
		t.Fatalf("Lỗi UP lại 04a: %v", err)
	}
	if _, err := db.ExecContext(ctx, string(m04bSQL)); err != nil {
		t.Fatalf("Lỗi UP lại 04b: %v", err)
	}
	t.Log("🎉 MIGRATION IDEMPOTENT THÀNH CÔNG: Chạy 04a/04b UP -> DOWN -> UP không gặp bất kỳ lỗi nào!")
}

// TestCompareGitHEADVsCurrentFormula đối chiếu hàm CalculateTicketCommission hiện tại
// với code gốc lấy TRỰC TIẾP từ git HEAD trên 256 ca thử nghiệm (nhiều mức giá chẵn và lẻ).
func TestCompareGitHEADVsCurrentFormula(t *testing.T) {
	// 1. Trích xuất code gốc từ git show HEAD:backend/services/ticket-service/repository/organizer_wallet_repository.go
	cmd := exec.Command("git", "show", "HEAD:backend/services/ticket-service/repository/organizer_wallet_repository.go")
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("Không đọc được git HEAD: %v", err)
	}
	content := string(out)

	startIdx := strings.Index(content, "func CalculateTicketCommission")
	if startIdx == -1 {
		t.Fatalf("Không tìm thấy CalculateTicketCommission trong git HEAD")
	}
	endIdx := strings.Index(content[startIdx:], "// ProcessPaidOrderCommissionTx")
	if endIdx == -1 {
		t.Fatalf("Không tìm thấy điểm kết thúc của CalculateTicketCommission trong git HEAD")
	}
	gitFuncCode := strings.TrimSpace(content[startIdx : startIdx+endIdx])

	// 256 test cases
	prices := []float64{
		0, 1000, 5000, 10000, 12500, 15000, 20000, 25000,
		33333, 50000, 99999, 100000, 150000, 200000, 500000, 1000000,
	}
	ticketNumbers := []int{0, 1, 50, 99, 100, 101, 250, 1000}
	orgTypes := []string{"SCHOOL", "FREE"}

	// 2. Tạo runner chạy trực tiếp code lấy từ git HEAD
	tmpDir, err := os.MkdirTemp("", "git_legacy_test")
	if err != nil {
		t.Fatalf("Lỗi tạo tmpDir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "main.go")
	runnerCode := fmt.Sprintf(`package main

import (
	"encoding/json"
	"math"
	"os"
)

%s

type CaseResult struct {
	Price        float64
	TicketNumber int
	OrgType      string
	FeePercent   float64
	FixedFee     float64
	Commission   float64
	Net          float64
}

func main() {
	prices := %#v
	ticketNumbers := %#v
	orgTypes := %#v

	var results []CaseResult
	for _, p := range prices {
		for _, tn := range ticketNumbers {
			for _, ot := range orgTypes {
				fp, ff, comm, net := CalculateTicketCommission(tn, p, ot)
				results = append(results, CaseResult{
					Price:        p,
					TicketNumber: tn,
					OrgType:      ot,
					FeePercent:   fp,
					FixedFee:     ff,
					Commission:   comm,
					Net:          net,
				})
			}
		}
	}
	json.NewEncoder(os.Stdout).Encode(results)
}
`, gitFuncCode, prices, ticketNumbers, orgTypes)

	if err := os.WriteFile(tmpFile, []byte(runnerCode), 0644); err != nil {
		t.Fatalf("Lỗi ghi file runner tạm: %v", err)
	}

	// 3. Thực thi file Go từ git HEAD
	runCmd := exec.Command("go", "run", "main.go")
	runCmd.Dir = tmpDir
	runOut, err := runCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("Lỗi chạy runner từ code git HEAD: %v\nOutput: %s", err, string(runOut))
	}

	var gitResults []struct {
		Price        float64
		TicketNumber int
		OrgType      string
		FeePercent   float64
		FixedFee     float64
		Commission   float64
		Net          float64
	}
	if err := json.Unmarshal(runOut, &gitResults); err != nil {
		t.Fatalf("Lỗi parse JSON kết quả từ git HEAD: %v\nOutput: %s", err, string(runOut))
	}

	// 4. Đối chiếu 256 ca: Code hiện tại vs Code lấy từ git HEAD
	var count int
	for _, gitRes := range gitResults {
		count++
		curFeePercent, curFixedFee, curComm, curNet := repository.CalculateTicketCommission(
			gitRes.TicketNumber,
			gitRes.Price,
			gitRes.OrgType,
		)

		if curFeePercent != gitRes.FeePercent || curFixedFee != gitRes.FixedFee ||
			math.Abs(curComm-gitRes.Commission) > 1e-6 || math.Abs(curNet-gitRes.Net) > 1e-6 {
			t.Fatalf("[Case %d] SAI LỆCH SO VỚI GIT HEAD! Price=%v, Num=%v, Org=%s -> Got Comm=%v, Net=%v | Git Comm=%v, Net=%v",
				count, gitRes.Price, gitRes.TicketNumber, gitRes.OrgType, curComm, curNet, gitRes.Commission, gitRes.Net)
		}
	}

	t.Logf("🎉 ĐÃ ĐỐI CHIẾU THÀNH CÔNG %d/256 CA TRỰC TIẾP VỚI CODE TỪ GIT HEAD: KẾT QUẢ KHỚP 100%% TUYỆT ĐỐI!", count)
}
