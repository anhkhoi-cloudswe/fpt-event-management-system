-- DOWN Migration: 04c_enforce_integer_fees.down.sql
-- Tháo bỏ ràng buộc số nguyên khi cần rollback về chế độ legacy cho phép hoa hồng thập phân.
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

ALTER TABLE financial_receipt 
DROP CONSTRAINT IF EXISTS chk_financial_receipt_integers;

COMMIT;
