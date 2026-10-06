# HƯỚNG DẪN DEPLOY PHA 1 (ZERO-DOWNTIME MIGRATION)

## 1. Kiểm tra tiền điều kiện trên DB Thật (Supabase Production / Staging) TRƯỚC KHI MERGE
Chạy 2 câu SQL sau và ghi nhận kết quả:
```sql
-- 1. Đếm số dòng net_amount < 0 (Xác nhận tính hợp lệ của constraint NOT VALID)
SELECT COUNT(*) AS negative_net_count 
FROM financial_receipt 
WHERE net_amount < 0 AND (is_reversal IS NOT TRUE);

-- 2. Đếm số dòng có số tiền lệch FLOOR
SELECT COUNT(*) AS floor_mismatch_count 
FROM financial_receipt 
WHERE gross_amount <> FLOOR(gross_amount) 
   OR commission_amount <> FLOOR(commission_amount) 
   OR net_amount <> FLOOR(net_amount) 
   OR fixed_fee <> FLOOR(fixed_fee);

-- 3. Thử nghiệm Extension btree_gist trên Supabase Staging trước khi chạy 04a:
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

---

## 2. Trình tự Deploy Production (Zero-Gap)

### BƯỚC 1: DB Migration 03 (Auto-commit)
Chạy file `Database/migrations/03_add_school_organizer_enum.sql`.
*Lưu ý: Không bọc trong transaction multi-statement.*

### BƯỚC 2: DB Migration 04a (Transaction)
Chạy file `Database/migrations/04a_subscription_and_dynamic_fees.sql`.
- Thêm cột snapshot nullable (KHÔNG default).
- Backfill toàn bộ dòng cũ sang `tier_code = 'LEGACY'`, `fee_source = 'LEGACY'`, `commission_bps = ROUND(system_fee_percentage * 100)::INTEGER`.
- Tạo các bảng mới (`subscription_tier`, `user_subscription`, `role_fee_policy`, `platform_system_parameter`, `fee_audit_log`, `platform_expense_ledger`).

### BƯỚC 3: Deploy Backend Code Pha 1
Deploy container / service backend chứa code cập nhật `ProcessPaidOrderCommissionTx`.
Code mới ghi nhận snapshot đầy đủ (`tier_code='LEGACY'`, `fee_source='LEGACY'`, `fee_config_version=1`, `commission_bps`) cho mọi giao dịch bán vé mới.

### BƯỚC 4: Kiểm tra và Chạy DB Migration 04b (Transaction)
Chỉ chạy sau khi kiểm tra xác nhận hệ thống không còn bất kỳ dòng `financial_receipt` mới nào thiếu snapshot:
```sql
SELECT COUNT(*) FROM financial_receipt WHERE tier_code IS NULL OR commission_bps IS NULL;
```
Khi count = 0, chạy file `Database/migrations/04b_enforce_receipt_snapshots.sql` để khóa `SET NOT NULL` vĩnh viễn.

---

## 3. Điểm chờ quyết định cho Pha 3.5
- **Phí cố định 1.000đ/vé:** Giữ kèm ngưỡng (20.000đ), giữ cho mọi vé, hay bỏ hoàn toàn. Điểm này KHÔNG chặn triển khai Pha 2, nhưng là điều kiện tiên quyết trước khi bắt đầu Pha 3.5.
