-- UP Migration: 04b_enforce_receipt_snapshots.sql
-- Bước 2 của Pha 1: Chạy sau khi code backend Pha 1 đã deploy hoàn tất.
-- Khóa NOT NULL cho các trường snapshot của financial_receipt để đảm bảo
-- không có bất kỳ lệnh INSERT nào thiếu thông tin snapshot.
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

ALTER TABLE financial_receipt 
ALTER COLUMN tier_code SET NOT NULL,
ALTER COLUMN commission_bps SET NOT NULL,
ALTER COLUMN fee_source SET NOT NULL,
ALTER COLUMN fee_config_version SET NOT NULL;

COMMIT;
