-- UP Migration: 04c_enforce_integer_fees.sql
-- Bước 3: Chỉ chạy khi chính thức bật cờ tính phí động USE_DYNAMIC_FEE_CALCULATION=true
-- Thêm ràng buộc kiểm tra toàn bộ số tiền trên biên lai là số nguyên tròn (int64 / floor)
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_receipt_integers'
    ) THEN
        ALTER TABLE financial_receipt 
        ADD CONSTRAINT chk_financial_receipt_integers 
        CHECK (
            gross_amount = FLOOR(gross_amount) AND 
            commission_amount = FLOOR(commission_amount) AND 
            net_amount = FLOOR(net_amount) AND 
            fixed_fee = FLOOR(fixed_fee)
        );
    END IF;
END $$;

COMMIT;
