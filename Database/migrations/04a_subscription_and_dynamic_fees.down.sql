-- DOWN Migration: 04a_subscription_and_dynamic_fees.down.sql
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

-- BƯỚC 1: Hoàn trả role trước khi drop previous_role
UPDATE users 
SET role = COALESCE(previous_role, 'ORGANIZER'::user_role_enum) 
WHERE role = 'SCHOOL_ORGANIZER'::user_role_enum;

-- BƯỚC 2: Drop các bảng tạo mới
DROP TABLE IF EXISTS fee_audit_log CASCADE;
DROP TABLE IF EXISTS platform_expense_ledger CASCADE;
DROP TABLE IF EXISTS organizer_fee_override CASCADE;
DROP TABLE IF EXISTS subscription_payment_log CASCADE;
DROP TABLE IF EXISTS user_subscription CASCADE;
DROP TABLE IF EXISTS subscription_tier CASCADE;
DROP TABLE IF EXISTS role_fee_policy CASCADE;
DROP TABLE IF EXISTS platform_system_parameter CASCADE;

-- BƯỚC 3: Loại bỏ constraints và cột snapshot
ALTER TABLE financial_receipt 
DROP CONSTRAINT IF EXISTS chk_financial_receipt_net_amount,
DROP CONSTRAINT IF EXISTS chk_financial_receipt_fee_source,
DROP COLUMN IF EXISTS tier_code,
DROP COLUMN IF EXISTS commission_bps,
DROP COLUMN IF EXISTS fee_source,
DROP COLUMN IF EXISTS fee_config_version,
DROP COLUMN IF EXISTS is_reversal,
DROP COLUMN IF EXISTS reversal_of_receipt_id,
DROP COLUMN IF EXISTS computed_at;

-- BƯỚC 4: Drop previous_role
ALTER TABLE users DROP COLUMN IF EXISTS previous_role;

COMMIT;
