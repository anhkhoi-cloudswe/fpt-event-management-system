-- DOWN Migration: 04b_enforce_receipt_snapshots.down.sql
-- Tháo bỏ NOT NULL cho các trường snapshot nếu cần rollback bước 04b.
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

ALTER TABLE financial_receipt 
ALTER COLUMN tier_code DROP NOT NULL,
ALTER COLUMN commission_bps DROP NOT NULL,
ALTER COLUMN fee_source DROP NOT NULL,
ALTER COLUMN fee_config_version DROP NOT NULL;

COMMIT;
