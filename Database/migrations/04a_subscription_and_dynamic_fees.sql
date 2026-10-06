-- UP Migration: 04a_subscription_and_dynamic_fees.sql
-- Bước 1 của Pha 1: Thêm cột nullable (không default), backfill 'LEGACY', tạo các bảng mới và seed data.
-- LƯU Ý: Chạy bọc trong Transaction.

BEGIN;

-- ============================================================
-- 0. Extension btree_gist để hỗ trợ EXCLUDE tstzrange
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. Bổ sung previous_role vào bảng users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_role user_role_enum;

-- ============================================================
-- 2. Bảng chính sách phí theo Role đặc thù (School Organizer)
-- ============================================================
CREATE TABLE IF NOT EXISTS role_fee_policy (
    role_code VARCHAR(50) PRIMARY KEY,              -- 'SCHOOL_ORGANIZER'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    commission_bps INTEGER NOT NULL DEFAULT 250 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
    max_capacity_limit INTEGER NOT NULL DEFAULT -1 CHECK (max_capacity_limit = -1 OR max_capacity_limit > 0),
    has_advanced_reports BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. Bảng cấu hình gói thanh toán Organizer (Free, Pro, Business)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_tier (
    tier_id SERIAL PRIMARY KEY,
    tier_code VARCHAR(50) NOT NULL UNIQUE,          -- 'FREE', 'PRO', 'BUSINESS'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_vnd BIGINT NOT NULL DEFAULT 0 CHECK (price_vnd >= 0),
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY')),
    commission_bps INTEGER NOT NULL DEFAULT 500 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
    max_capacity_limit INTEGER NOT NULL DEFAULT 100 CHECK (max_capacity_limit = -1 OR max_capacity_limit > 0),
    has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_free_tier_always_active CHECK (tier_code <> 'FREE' OR is_active = TRUE)
);

-- ============================================================
-- 4. Bảng vòng đời mua gói Organizer (Subscription Lifecycle)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_subscription (
    subscription_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tier_id INTEGER NOT NULL REFERENCES subscription_tier(tier_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'UPGRADED')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    amount_paid_vnd BIGINT NOT NULL DEFAULT 0,
    prorated_credit_vnd BIGINT NOT NULL DEFAULT 0,
    scheduled_downgrade_tier_id INTEGER REFERENCES subscription_tier(tier_id) ON DELETE SET NULL,
    request_id VARCHAR(100) UNIQUE,                -- Idempotency key
    bill_id INTEGER REFERENCES bill(bill_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_active_subscription 
ON user_subscription (user_id) 
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_user_subscription_lookup 
ON user_subscription (user_id, status, end_date);

-- Bảng nhật ký thanh toán/gia hạn từng giao dịch (Idempotency theo request_id)
CREATE TABLE IF NOT EXISTS subscription_payment_log (
    payment_id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES user_subscription(subscription_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tier_id INTEGER NOT NULL REFERENCES subscription_tier(tier_id) ON DELETE RESTRICT,
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('INITIAL', 'RENEWAL', 'UPGRADE', 'AUTO_RENEW')),
    amount_paid_vnd BIGINT NOT NULL DEFAULT 0,
    prorated_credit_vnd BIGINT NOT NULL DEFAULT 0,
    request_id VARCHAR(100) UNIQUE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_payment_user_req ON subscription_payment_log (user_id, request_id);

-- ============================================================
-- 5. Bảng ưu đãi riêng Organizer (Không chồng lấn thời gian)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizer_fee_override (
    override_id SERIAL PRIMARY KEY,
    organizer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    commission_bps INTEGER NOT NULL CHECK (commission_bps >= 0 AND commission_bps <= 10000),
    reason TEXT NOT NULL,
    effective_range TSTZRANGE NOT NULL,            -- [start, end)
    created_by INTEGER NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_organizer_fee_override_no_overlap 
    EXCLUDE USING gist (organizer_id WITH =, effective_range WITH &&)
);

-- ============================================================
-- 6. Bảng tham số hệ thống chung
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_system_parameter (
    param_key VARCHAR(50) PRIMARY KEY,
    param_value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
);

-- ============================================================
-- 7. Bảng Audit Log
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_audit_log (
    log_id SERIAL PRIMARY KEY,
    target_entity VARCHAR(50) NOT NULL,            -- 'ROLE_POLICY', 'SUBSCRIPTION_TIER', 'FEE_OVERRIDE', 'USER_ROLE', 'SYSTEM_PARAM'
    target_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,                   -- 'CREATE', 'UPDATE', 'DEACTIVATE', 'ROLE_ASSIGN', 'ROLE_REVOKE'
    old_value JSONB,
    new_value JSONB,
    reason TEXT NOT NULL,
    changed_by INTEGER NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fee_audit_log_target ON fee_audit_log (target_entity, target_id);

-- ============================================================
-- 8. Bảng Sổ Cái Chi Phí Nền Tảng (Platform Expense Ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_expense_ledger (
    expense_id SERIAL PRIMARY KEY,
    expense_type VARCHAR(50) NOT NULL,            -- 'GATEWAY_REFUND_FEE', 'SYSTEM_COMPENSATION'
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    reference_type VARCHAR(50),                   -- 'BILL', 'TICKET'
    reference_id VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_expense_ref ON platform_expense_ledger (reference_type, reference_id);

-- ============================================================
-- 9. Nâng cấp bảng financial_receipt: Bổ sung Snapshot bất biến
-- (QUY TẮC 1: CỘT NULLABLE KHÔNG DEFAULT CHO SNAPSHOT FIELDS)
-- ============================================================
ALTER TABLE financial_receipt 
ADD COLUMN IF NOT EXISTS tier_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS commission_bps INTEGER,
ADD COLUMN IF NOT EXISTS fee_source VARCHAR(20),
ADD COLUMN IF NOT EXISTS fee_config_version INTEGER,
ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reversal_of_receipt_id INTEGER REFERENCES financial_receipt(receipt_id),
ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Constraint Idempotent có tên cho fee_source
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_receipt_fee_source'
    ) THEN
        ALTER TABLE financial_receipt 
        ADD CONSTRAINT chk_financial_receipt_fee_source 
        CHECK (fee_source IN ('OVERRIDE', 'ROLE', 'TIER', 'FREE', 'LEGACY'));
    END IF;
END $$;

-- Constraint Idempotent: net_amount >= 0 cho biên lai gốc, cho phép âm khi hoàn vé (is_reversal = TRUE)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_receipt_net_amount'
    ) THEN
        ALTER TABLE financial_receipt 
        ADD CONSTRAINT chk_financial_receipt_net_amount 
        CHECK (is_reversal = TRUE OR net_amount >= 0);
    END IF;
END $$;


-- ============================================================
-- 10. BACKFILL DỮ LIỆU CŨ TRONG FINANCIAL_RECEIPT
-- (Khớp chính xác các dòng cũ có tier_code IS NULL)
-- ============================================================
UPDATE financial_receipt
SET 
  tier_code = 'LEGACY',
  fee_source = 'LEGACY',
  commission_bps = ROUND(system_fee_percentage * 100)::INTEGER,
  fee_config_version = 1,
  computed_at = created_at
WHERE tier_code IS NULL;

-- ============================================================
-- 11. Seed Dữ liệu mặc định ban đầu
-- ============================================================
INSERT INTO role_fee_policy (role_code, name, description, commission_bps, max_capacity_limit, has_advanced_reports, is_active) VALUES
('SCHOOL_ORGANIZER', 'Người tổ chức cấp Trường', 'Vai trò do trường cấp cho cán bộ/phòng ban', 250, -1, TRUE, TRUE)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO subscription_tier (tier_code, name, description, price_vnd, billing_cycle, commission_bps, max_capacity_limit, has_advanced_reports, is_active) VALUES
('FREE', 'Gói Miễn Phí', 'Gói mặc định cho sự kiện quy mô <= 100 người', 0, 'MONTHLY', 500, 100, FALSE, TRUE),
('PRO', 'Gói Chuyên Nghiệp', 'Sự kiện lớn không giới hạn, hoa hồng 2.5%, mở khóa báo cáo', 299000, 'MONTHLY', 250, -1, TRUE, TRUE),
('BUSINESS', 'Gói Doanh Nghiệp', '0% hoa hồng sàn, không giới hạn sức chứa, toàn quyền báo cáo', 1000000, 'MONTHLY', 0, -1, TRUE, TRUE)
ON CONFLICT (tier_code) DO NOTHING;

INSERT INTO platform_system_parameter (param_key, param_value, description) VALUES
('FEE_CONFIG_VERSION', '1', 'Phiên bản biểu phí hiện tại'),
('FIXED_FEE_PER_TICKET', '1000', 'Phí cố định thu trên mỗi vé bán ra (VNĐ) - Điểm chờ quyết định'),
('FIXED_FEE_MIN_TICKET_PRICE', '20000', 'Giá vé tối thiểu để áp dụng phí cố định (VNĐ)'),
('REFUND_GATEWAY_FEE_BEARER', 'PLATFORM', 'Chủ thể chịu phí cổng thanh toán khi hoàn vé: PLATFORM hoặc ORGANIZER')
ON CONFLICT (param_key) DO NOTHING;

COMMIT;
